from datetime import datetime
from pathlib import Path
from uuid import uuid4
import json
import csv
from io import StringIO

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from pypdf import PdfReader
from docx import Document as DocxDocument
from openpyxl import load_workbook

from app.db import Base, engine, SessionLocal
from app.models import Project, Document
from app.schemas import ProjectCreate, ProjectResponse, DocumentResponse

app = FastAPI(title="Dniche LEED AI Backend")

UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json"}
SUPPORTED_PARSE_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".pdf", ".docx", ".xlsx"}


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
