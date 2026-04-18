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


class CorrectiveActionResponse(BaseModel):
    discipline: str
    priority: str
    action: str
    reason: str


class ReviewFindingResponse(BaseModel):
    topic_id: str
    topic_name: str
    status: str
    score: int
    max_score: int
    progress_percent: int
    evidence_count: int
    searched_keywords: list[str]
    recommendation: str
    evidences: list[ReviewEvidenceItemResponse]
    corrective_actions: list[CorrectiveActionResponse]


class Agent1ReviewResponse(BaseModel):
    project_id: int
    project_name: str
    overall_status: str
    overall_score: int
    overall_max_score: int
    overall_progress_percent: int
    reviewed_document_count: int
    parsed_document_count: int
    findings: list[ReviewFindingResponse]


class EnergyFindingResponse(BaseModel):
    readiness_item_id: str
    readiness_item_name: str
    status: str
    score: int
    max_score: int
    progress_percent: int
    evidence_count: int
    searched_keywords: list[str]
    summary: str
    missing_inputs: list[str]
    evidences: list[ReviewEvidenceItemResponse]
    corrective_actions: list[CorrectiveActionResponse]


class Agent2EnergyReviewResponse(BaseModel):
    project_id: int
    project_name: str
    overall_status: str
    overall_score: int
    overall_max_score: int
    overall_progress_percent: int
    reviewed_document_count: int
    parsed_document_count: int
    findings: list[EnergyFindingResponse]
