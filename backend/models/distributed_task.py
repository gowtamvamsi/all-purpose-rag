import uuid
from sqlalchemy import Column, Integer, ForeignKey, DateTime, func, Text, String
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from backend.database import Base

class DistributedTask(Base):
    __tablename__ = "distributed_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    page_number = Column(Integer, nullable=True)
    task_type = Column(String(50), default="pdf_extract", nullable=False, index=True)
    payload = Column(JSONB, nullable=True)
    required_hardware = Column(String(50), default="cpu", nullable=False)
    status = Column(String(50), default="pending", nullable=False, index=True) # pending, processing, completed, failed
    assigned_to = Column(String(255), nullable=True) # ID of client worker browser
    result_text = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    document = relationship("Document")
