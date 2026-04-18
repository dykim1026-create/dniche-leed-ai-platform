from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class DocumentResponse(BaseModel):
    id: int
    project_id: int
    original_filename: str
    stored_filename: str
    file_path: str
    content_type: Optional[str] = None
    file_size: int
    parse_status: str
    parse_message: Optional[str] = None
    extracted_text: Optional[str] = None
    uploaded_at: datetime
    parsed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DocumentSearchResultResponse(BaseModel):
    document_id: int
    project_id: int
    original_filename: str
    parse_status: str
    matched_field: str
    match_count: int
    snippet: str


class ReviewEvidenceItemResponse(BaseModel):
    document_id: int
    original_filename: str
    keyword: str
    snippet: str


class ReviewFindingResponse(BaseModel):
    topic_id: str
    topic_name: str
    status: str
    evidence_count: int
    searched_keywords: list[str]
    recommendation: str
    evidences: list[ReviewEvidenceItemResponse]


class Agent1ReviewResponse(BaseModel):
    project_id: int
    project_name: str
    overall_status: str
    reviewed_document_count: int
    parsed_document_count: int
    findings: list[ReviewFindingResponse]
