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
    uploaded_at: datetime

    class Config:
        from_attributes = True
