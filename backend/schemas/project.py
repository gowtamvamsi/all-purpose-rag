from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    llm_model: str = "claude-sonnet-4-20250514"
    retrieval_top_k: int = Field(6, ge=1, le=20)

class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    llm_model: Optional[str] = None
    retrieval_top_k: Optional[int] = Field(None, ge=1, le=20)

class ProjectResponse(BaseModel):
    id: UUID
    owner_id: UUID
    name: str
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    llm_model: str
    retrieval_top_k: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ProjectStatsResponse(BaseModel):
    document_count: int
    chunk_count: int
    conversation_count: int
