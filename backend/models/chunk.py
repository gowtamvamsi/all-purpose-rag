import uuid
from sqlalchemy import Column, Integer, ForeignKey, DateTime, func, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from backend.database import Base

class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    
    # 1536-dimensional OpenAI text-embedding-3-small vector
    embedding = Column(Vector(1536), nullable=True)
    token_count = Column(Integer, nullable=True)
    page_number = Column(Integer, nullable=True)
    extra_metadata = Column("metadata", JSON, default=dict, server_default="{}", nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    document = relationship("Document", back_populates="chunks")
    project = relationship("Project", back_populates="chunks")
    message_sources = relationship("MessageSource", back_populates="chunk", cascade="all, delete-orphan")
