from datetime import datetime
from pathlib import Path
from uuid import uuid4
import json
import csv
from io import StringIO

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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
    CorrectiveActionResponse,
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

CORRECTIVE_ACTION_LIBRARY = {
    "energy_performance": [
        {
            "discipline": "Architecture",
            "action": "Provide envelope performance summary including wall, roof, glazing, and shading assumptions.",
            "reason": "Envelope-related evidence is needed to support energy compliance review.",
        },
        {
            "discipline": "Mechanical",
            "action": "Provide HVAC system description, efficiencies, controls sequence, and ventilation basis.",
            "reason": "Mechanical design evidence is central to energy performance assessment.",
        },
        {
            "discipline": "Electrical",
            "action": "Provide lighting power density, lighting controls, and major equipment load assumptions.",
            "reason": "Lighting and connected loads affect energy evaluation and documentation.",
        },
        {
            "discipline": "Sustainability",
            "action": "Prepare or update the energy model narrative and cross-check design inputs against LEED submission needs.",
            "reason": "A coordinated sustainability review is needed to consolidate evidence.",
        },
    ],
    "water_efficiency": [
        {
            "discipline": "Plumbing",
            "action": "Provide plumbing fixture schedule with flow rates and flush rates for all fixture types.",
            "reason": "Fixture performance data is required for water reduction review.",
        },
        {
            "discipline": "Landscape",
            "action": "Provide irrigation strategy, landscape water demand assumptions, and any reduced-water design measures.",
            "reason": "Outdoor water use evidence is needed for landscape-related water credits.",
        },
        {
            "discipline": "Architecture",
            "action": "Confirm any water-using equipment or special spaces that may affect baseline and proposed usage.",
            "reason": "Architectural program information can change water demand assumptions.",
        },
        {
            "discipline": "Sustainability",
            "action": "Prepare indoor and outdoor water calculation sheets aligned with the target credit path.",
            "reason": "A consolidated calculation package is required for review and submittal.",
        },
    ],
    "materials": [
        {
            "discipline": "Architecture",
            "action": "Provide finish schedules, material specifications, and product-level sustainability documentation where available.",
            "reason": "Architectural material data supports materials and carbon-related review.",
        },
        {
            "discipline": "Structure",
            "action": "Provide concrete and steel quantity summaries, mix information, and any low-carbon alternatives under consideration.",
            "reason": "Structural materials usually drive embodied carbon impact.",
        },
        {
            "discipline": "Procurement / Cost",
            "action": "Collect EPDs, recycled content declarations, and supplier sustainability documents for priority products.",
            "reason": "Supplier documentation is needed to substantiate material-related claims.",
        },
        {
            "discipline": "Sustainability",
            "action": "Prepare a material compliance tracker showing required evidence by package and responsible consultant.",
            "reason": "Tracking is needed to avoid documentation gaps across disciplines.",
        },
    ],
    "ieq": [
        {
            "discipline": "Mechanical",
            "action": "Provide ventilation calculations, outside air assumptions, filtration approach, and IAQ-related control strategy.",
            "reason": "Ventilation evidence is a key IEQ input.",
        },
        {
            "discipline": "Architecture",
            "action": "Provide daylight, glazing, shading, and spatial planning information relevant to occupied spaces.",
            "reason": "Architectural design decisions strongly affect IEQ performance.",
        },
        {
            "discipline": "Interior Design",
            "action": "Provide low-VOC material specifications and interior finish schedules.",
            "reason": "Interior product selections affect emissions-related IEQ review.",
        },
        {
            "discipline": "Sustainability",
            "action": "Prepare an IEQ evidence matrix covering ventilation, materials, daylight, and thermal comfort inputs.",
            "reason": "A coordinated matrix reduces missing evidence during LEED review.",
        },
    ],
}


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


def get_topic_score(status: str) -> int:
    if status == "evidence_found":
        return 100
    if status == "limited_evidence":
        return 50
    return 0


def determine_overall_status(findings: list[ReviewFindingResponse], parsed_document_count: int) -> str:
    if parsed_document_count == 0:
        return "insufficient_documents"

    statuses = [finding.status for finding in findings]

    if all(status == "evidence_found" for status in statuses):
        return "good_initial_coverage"
    if any(status in {"evidence_found", "limited_evidence"} for status in statuses):
        return "partial_coverage"
    return "insufficient_evidence"


def get_priority_for_status(status: str) -> str:
    if status == "no_evidence":
        return "high"
    if status == "limited_evidence":
        return "medium"
    return "low"


def build_corrective_actions(topic_id: str, status: str):
    base_actions = CORRECTIVE_ACTION_LIBRARY.get(topic_id, [])
    priority = get_priority_for_status(status)

    corrective_actions = []
    for item in base_actions:
        if status == "no_evidence":
            action_text = f"Immediately provide: {item['action']}"
            reason_text = f"{item['reason']} Current review found no supporting evidence."
        elif status == "limited_evidence":
            action_text = f"Strengthen documentation: {item['action']}"
            reason_text = f"{item['reason']} Current review found only limited evidence."
        else:
            action_text = f"Refine and verify: {item['action']}"
            reason_text = f"{item['reason']} Evidence exists, but should be validated and organized for submission readiness."

        corrective_actions.append(
            CorrectiveActionResponse(
                discipline=item["discipline"],
                priority=priority,
                action=action_text,
                reason=reason_text,
            )
        )

    return corrective_actions


def build_agent1_review(project_id: int, db: Session) -> Agent1ReviewResponse:
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
        corrective_actions = build_corrective_actions(topic["topic_id"], status)
        score = get_topic_score(status)
        max_score = 100
        progress_percent = score

        findings.append(
            ReviewFindingResponse(
                topic_id=topic["topic_id"],
                topic_name=topic["topic_name"],
                status=status,
                score=score,
                max_score=max_score,
                progress_percent=progress_percent,
                evidence_count=total_count,
                searched_keywords=topic["keywords"],
                recommendation=topic["recommendation"],
                evidences=evidences,
                corrective_actions=corrective_actions,
            )
        )

    overall_status = determine_overall_status(findings, len(parsed_documents))
    overall_score = sum(finding.score for finding in findings)
    overall_max_score = sum(finding.max_score for finding in findings) if findings else 0
    overall_progress_percent = int((overall_score / overall_max_score) * 100) if overall_max_score else 0

    return Agent1ReviewResponse(
        project_id=project.id,
        project_name=project.name,
        overall_status=overall_status,
        overall_score=overall_score,
        overall_max_score=overall_max_score,
        overall_progress_percent=overall_progress_percent,
        reviewed_document_count=len(documents),
        parsed_document_count=len(parsed_documents),
        findings=findings,
    )


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
    return build_agent1_review(project_id, db)


@app.get("/projects/{project_id}/agent1/export.csv")
def export_agent1_review_csv(project_id: int, db: Session = Depends(get_db)):
    review = build_agent1_review(project_id, db)

    output = StringIO()
    writer = csv.writer(output)

    writer.writerow(["Project ID", review.project_id])
    writer.writerow(["Project Name", review.project_name])
    writer.writerow(["Overall Status", review.overall_status])
    writer.writerow(["Overall Score", f"{review.overall_score}/{review.overall_max_score}"])
    writer.writerow(["Overall Progress", f"{review.overall_progress_percent}%"])
    writer.writerow(["Reviewed Document Count", review.reviewed_document_count])
    writer.writerow(["Parsed Document Count", review.parsed_document_count])
    writer.writerow([])

    writer.writerow([
        "Topic ID",
        "Topic Name",
        "Status",
        "Score",
        "Max Score",
        "Progress Percent",
        "Evidence Count",
        "Searched Keywords",
        "Recommendation",
        "Discipline",
        "Priority",
        "Corrective Action",
        "Reason",
        "Evidence Document",
        "Evidence Keyword",
        "Evidence Snippet",
    ])

    for finding in review.findings:
        max_rows = max(
            1,
            len(finding.corrective_actions),
            len(finding.evidences),
        )

        for i in range(max_rows):
            corrective_action = finding.corrective_actions[i] if i < len(finding.corrective_actions) else None
            evidence = finding.evidences[i] if i < len(finding.evidences) else None

            writer.writerow([
                finding.topic_id if i == 0 else "",
                finding.topic_name if i == 0 else "",
                finding.status if i == 0 else "",
                finding.score if i == 0 else "",
                finding.max_score if i == 0 else "",
                finding.progress_percent if i == 0 else "",
                finding.evidence_count if i == 0 else "",
                ", ".join(finding.searched_keywords) if i == 0 else "",
                finding.recommendation if i == 0 else "",
                corrective_action.discipline if corrective_action else "",
                corrective_action.priority if corrective_action else "",
                corrective_action.action if corrective_action else "",
                corrective_action.reason if corrective_action else "",
                evidence.original_filename if evidence else "",
                evidence.keyword if evidence else "",
                evidence.snippet if evidence else "",
            ])

    output.seek(0)
    filename = f"agent1_review_project_{review.project_id}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )
