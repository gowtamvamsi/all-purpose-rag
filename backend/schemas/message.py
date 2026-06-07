from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime

class MessageSourceResponse(BaseModel):
    document_name: str
    chunk_content: str
    page_number: Optional[int] = None
    similarity_score: float

class MessageCreate(BaseModel):
    content: str

class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    role: str
    content: str
    token_count: Optional[int] = None
    created_at: datetime
    sources: Optional[List[MessageSourceResponse]] = []

    class Config:
        from_attributes = True
