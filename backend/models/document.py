import uuid
from sqlalchemy import Column, String, Integer, BigInteger, ForeignKey, DateTime, func, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from backend.database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    file_type = Column(String, nullable=False) # e.g. pdf, docx, txt, png, etc.
    mime_type = Column(String, nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    s3_key = Column(String, nullable=False) # Store the file path or S3 key
    s3_bucket = Column(String, nullable=False)
    
    # Status can be: 'uploading', 'processing', 'ready', 'error'
    status = Column(String, default="uploading", nullable=False, index=True)
    error_message = Column(Text, nullable=True)
    chunk_count = Column(Integer, default=0)
    page_count = Column(Integer, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    project = relationship("Project", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")
