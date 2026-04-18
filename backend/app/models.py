from datetime import datetime

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text
from app.db import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    original_filename = Column(String, nullable=False)
    stored_filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    content_type = Column(String, nullable=True)
    file_size = Column(Integer, nullable=False, default=0)
    parse_status = Column(String, nullable=False, default="uploaded")
    parse_message = Column(String, nullable=True)
    extracted_text = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    parsed_at = Column(DateTime, nullable=True)
