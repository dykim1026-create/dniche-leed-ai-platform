from datetime import datetime
from pathlib import Path
from uuid import uuid4
import json
import csv
from io import StringIO

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from pypdf import PdfReader
from docx import Document as DocxDocument
from openpyxl import load_workbook

from app.db import Base, engine, SessionLocal
from app.models import Project, Document
from app.schemas import (
    ProjectCreate,
    ProjectResponse,
    DocumentResponse,
    DocumentSearchResultResponse,
    ReviewEvidenceItemResponse,
    ReviewFindingResponse,
    Agent1ReviewResponse,
)

app = FastAPI(title="Dniche LEED AI Backend")

UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json"}
SUPPORTED_PARSE_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".pdf", ".docx", ".xlsx"}

REVIEW_TOPICS = [
    {
        "topic_id": "energy_performance",
        "topic_name": "Energy Performance",
        "keywords": ["energy", "eui", "hvac", "lighting", "envelope", "ashrae"],
        "recommendation": "Add or improve energy model evidence, HVAC narrative, lighting power details, and envelope performance documentation.",
    },
    {
        "topic_id": "water_efficiency",
        "topic_name": "Water Efficiency",
        "keywords": ["water", "fixture", "flow rate", "irrigation", "gpm", "gpf"],
        "recommendation": "Add fixture schedules, water use calculations, irrigation strategy, and indoor/outdoor water reduction evidence.",
    },
    {
        "topic_id": "materials",
        "topic_name": "Materials and Embodied Carbon",
        "keywords": ["material", "epd", "recycled", "concrete", "steel", "carbon"],
        "recommendation": "Add material schedules, EPD references, recycled content information, and carbon-related documentation.",
    },
    {
        "topic_id": "ieq",
        "topic_name": "Indoor Environmental Quality",
        "keywords": ["ventilation", "voc", "daylight", "co2", "thermal comfort", "iaq"],
        "recommendation": "Add ventilation basis, IAQ strategy, VOC-related specifications, daylight evidence, and thermal comfort notes.",
    },
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS parse_status VARCHAR DEFAULT 'uploaded'"))
        connection.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS parse_message VARCHAR"))
        connection.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_text TEXT"))
        connection.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS parsed_at TIMESTAMP"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def parse_text_like_file(file_path: Path) -> str:
    suffix = file_path.suffix.lower()

    if suffix in {".txt", ".md"}:
        return file_path.read_text(encoding="utf-8", errors="replace")

    if suffix == ".json":
        raw_text = file_path.read_text(encoding="utf-8", errors="replace")
        try:
            parsed = json.loads(raw_text)
            return json.dumps(parsed, ensure_ascii=False, indent=2)
        except Exception:
            return raw_text

    if suffix == ".csv":
        raw_text = file_path.read_text(encoding="utf-8", errors="replace")
        reader = csv.reader(StringIO(raw_text))
        rows = []
        for row in reader:
            rows.append(" | ".join(row))
        return "\n".join(rows)

    raise ValueError("Unsupported text-like file type")


def parse_pdf_file(file_path: Path) -> str:
    reader = PdfReader(str(file_path))
    pages = []

    for idx, page in enumerate(reader.pages, start=1):
        text_content = page.extract_text() or ""
        pages.append(f"[Page {idx}]\n{text_content.strip()}")

    return "\n\n".join(pages).strip()


def parse_docx_file(file_path: Path) -> str:
    doc = DocxDocument(str(file_path))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]

    table_lines = []
    for table in doc.tables:
        for row in table.rows:
            values = [cell.text.strip() for cell in row.cells]
            if any(values):
                table_lines.append(" | ".join(values))

    combined = []
    if paragraphs:
        combined.append("\n".join(paragraphs))
    if table_lines:
        combined.append("\n".join(table_lines))

    return "\n\n".join(combined).strip()


def parse_xlsx_file(file_path: Path) -> str:
    workbook = load_workbook(filename=str(file_path), data_only=True)
    sheets_output = []

    for sheet in workbook.worksheets:
        rows_output = [f"[Sheet: {sheet.title}]"]
        for row in sheet.iter_rows(values_only=True):
            values = ["" if value is None else str(value) for value in row]
            if any(v.strip() for v in values):
                rows_output.append(" | ".join(values))
        sheets_output.append("\n".join(rows_output))

    return "\n\n".join(sheets_output).strip()


def parse_supported_file(document: Document) -> tuple[str, str | None, str | None]:
    file_path = Path(document.file_path)

    if not file_path.exists():
        return "failed", "File not found on disk.", None

    suffix = file_path.suffix.lower()

    if suffix not in SUPPORTED_PARSE_EXTENSIONS:
        return (
            "pending_parser",
            "Parser not available for this file type yet.",
            None,
        )

    try:
        if suffix in TEXT_EXTENSIONS:
            extracted_text = parse_text_like_file(file_path)
        elif suffix == ".pdf":
            extracted_text = parse_pdf_file(file_path)
        elif suffix == ".docx":
            extracted_text = parse_docx_file(file_path)
        elif suffix == ".xlsx":
            extracted_text = parse_xlsx_file(file_path)
        else:
            return "pending_parser", "Parser not available for this file type yet.", None

        extracted_text = extracted_text.strip()

        if not extracted_text:
            return "parsed", "Parsing completed but no readable text was extracted.", ""

        return "parsed", "Parsing completed successfully.", extracted_text

    except Exception as e:
        return "failed", f"Parsing failed: {str(e)}", None


def build_snippet(source_text: str, query: str, radius: int = 120) -> str:
    if not source_text:
        return ""

    lower_source = source_text.lower()
    lower_query = query.lower()
    index = lower_source.find(lower_query)

    if index == -1:
        snippet = source_text[: radius * 2]
        return snippet.strip()

    start = max(0, index - radius)
    end = min(len(source_text), index + len(query) + radius)
    snippet = source_text[start:end].strip()

    if start > 0:
        snippet = "..." + snippet
    if end < len(source_text):
        snippet = snippet + "..."

    return snippet


def collect_topic_evidence(documents: list[Document], keywords: list[str], max_items: int = 5):
    evidences = []
    total_count = 0

    for document in documents:
        extracted_text = document.extracted_text or ""
        lower_text = extracted_text.lower()

        for keyword in keywords:
            keyword_lower = keyword.lower()
            count = lower_text.count(keyword_lower)
            if count > 0:
                total_count += count
                evidences.append(
                    ReviewEvidenceItemResponse(
                        document_id=document.id,
                        original_filename=document.original_filename,
                        keyword=keyword,
                        snippet=build_snippet(extracted_text, keyword),
                    )
                )
                break

        if len(evidences) >= max_items:
            break

    return evidences, total_count


def determine_finding_status(total_count: int) -> str:
    if total_count >= 3:
        return "evidence_found"
    if total_count >= 1:
        return "limited_evidence"
    return "no_evidence"


def determine_overall_status(findings: list[ReviewFindingResponse], parsed_document_count: int) -> str:
    if parsed_document_count == 0:
        return "insufficient_documents"

    statuses = [finding.status for finding in findings]

    if all(status == "evidence_found" for status in statuses):
        return "good_initial_coverage"
    if any(status in {"evidence_found", "limited_evidence"} for status in statuses):
        return "partial_coverage"
    return "insufficient_evidence"


@app.get("/")
def read_root():
    return {"message": "Backend is running"}


@app.get("/health")
def health():
    db_status = "unknown"

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "app_status": "ok",
        "db_status": db_status
    }


@app.post("/projects", response_model=ProjectResponse)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(
        name=payload.name,
        description=payload.description
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@app.get("/projects", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.id.asc()).all()


@app.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.post("/projects/{project_id}/documents", response_model=DocumentResponse)
async def upload_document(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_dir = UPLOAD_DIR / f"project_{project_id}"
    project_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(file.filename).suffix
    stored_filename = f"{uuid4().hex}{suffix}"
    destination = project_dir / stored_filename

    content = await file.read()
    with open(destination, "wb") as buffer:
        buffer.write(content)

    document = Document(
        project_id=project_id,
        original_filename=file.filename,
        stored_filename=stored_filename,
        file_path=str(destination),
        content_type=file.content_type,
        file_size=len(content),
        parse_status="uploaded",
        parse_message="File uploaded successfully. Parsing not started yet.",
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    return document


@app.get("/projects/{project_id}/documents", response_model=list[DocumentResponse])
def list_documents(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return (
        db.query(Document)
        .filter(Document.project_id == project_id)
        .order_by(Document.id.desc())
        .all()
    )


@app.post("/documents/{document_id}/parse", response_model=DocumentResponse)
def parse_document(document_id: int, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    document.parse_status = "processing"
    document.parse_message = "Parsing in progress..."
    db.commit()
    db.refresh(document)

    parse_status, parse_message, extracted_text = parse_supported_file(document)

    document.parse_status = parse_status
    document.parse_message = parse_message
    document.extracted_text = extracted_text
    document.parsed_at = datetime.utcnow()

    db.commit()
    db.refresh(document)

    return document


@app.get(
    "/projects/{project_id}/documents/search",
    response_model=list[DocumentSearchResultResponse],
)
def search_project_documents(
    project_id: int,
    query: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    normalized_query = query.strip().lower()
    if not normalized_query:
        raise HTTPException(status_code=400, detail="Query must not be empty")

    documents = (
        db.query(Document)
        .filter(Document.project_id == project_id)
        .order_by(Document.id.desc())
        .all()
    )

    results = []

    for document in documents:
        filename = document.original_filename or ""
        extracted_text = document.extracted_text or ""

        filename_count = filename.lower().count(normalized_query)
        text_count = extracted_text.lower().count(normalized_query)
        total_count = filename_count + text_count

        if total_count == 0:
            continue

        matched_field = "extracted_text" if text_count >= filename_count and text_count > 0 else "original_filename"
        snippet_source = extracted_text if matched_field == "extracted_text" else filename
        snippet = build_snippet(snippet_source, query)

        results.append(
            DocumentSearchResultResponse(
                document_id=document.id,
                project_id=document.project_id,
                original_filename=document.original_filename,
                parse_status=document.parse_status,
                matched_field=matched_field,
                match_count=total_count,
                snippet=snippet,
            )
        )

    results.sort(key=lambda item: (-item.match_count, item.document_id))
    return results[:limit]


@app.get("/projects/{project_id}/agent1/review", response_model=Agent1ReviewResponse)
def run_agent1_review(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    documents = (
        db.query(Document)
        .filter(Document.project_id == project_id)
        .order_by(Document.id.desc())
        .all()
    )

    parsed_documents = [
        document
        for document in documents
        if document.parse_status == "parsed" and (document.extracted_text or "").strip()
    ]

    findings = []

    for topic in REVIEW_TOPICS:
        evidences, total_count = collect_topic_evidence(parsed_documents, topic["keywords"])
        status = determine_finding_status(total_count)

        findings.append(
            ReviewFindingResponse(
                topic_id=topic["topic_id"],
                topic_name=topic["topic_name"],
                status=status,
                evidence_count=total_count,
                searched_keywords=topic["keywords"],
                recommendation=topic["recommendation"],
                evidences=evidences,
            )
        )

    overall_status = determine_overall_status(findings, len(parsed_documents))

    return Agent1ReviewResponse(
        project_id=project.id,
        project_name=project.name,
        overall_status=overall_status,
        reviewed_document_count=len(documents),
        parsed_document_count=len(parsed_documents),
        findings=findings,
    )
