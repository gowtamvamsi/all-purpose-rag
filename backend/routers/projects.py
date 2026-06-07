from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, and_
from uuid import UUID

from backend.database import get_db
from backend.models.user import User
from backend.models.project import Project
from backend.models.document import Document
from backend.models.chunk import DocumentChunk
from backend.models.conversation import Conversation
from backend.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectStatsResponse
from backend.services.auth_service import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])

async def get_project_or_404(
    project_id: UUID,
    current_user: User,
    db: AsyncSession
) -> Project:
    result = await db.execute(
        select(Project).where(
            and_(Project.id == project_id, Project.owner_id == current_user.id)
        ) if 'and_' in globals() else 
        select(Project).where(Project.id == project_id, Project.owner_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or you do not have permission"
        )
    return project

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    project = Project(
        owner_id=current_user.id,
        name=payload.name,
        description=payload.description,
        system_prompt=payload.system_prompt,
        llm_model=payload.llm_model,
        retrieval_top_k=payload.retrieval_top_k
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)
    return project

@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Project).where(Project.owner_id == current_user.id).order_by(Project.created_at.desc())
    )
    return result.scalars().all()

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await get_project_or_404(project_id, current_user, db)

@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    project = await get_project_or_404(project_id, current_user, db)
    
    if payload.name is not None:
        project.name = payload.name
    if payload.description is not None:
        project.description = payload.description
    if payload.system_prompt is not None:
        project.system_prompt = payload.system_prompt
    if payload.llm_model is not None:
        project.llm_model = payload.llm_model
    if payload.retrieval_top_k is not None:
        project.retrieval_top_k = payload.retrieval_top_k
        
    await db.flush()
    await db.refresh(project)
    return project

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    project = await get_project_or_404(project_id, current_user, db)
    
    # Cascade delete is handled by ORM relationships
    await db.delete(project)
    await db.flush()

@router.get("/{project_id}/stats", response_model=ProjectStatsResponse)
async def get_project_stats(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Ensure project exists
    await get_project_or_404(project_id, current_user, db)
    
    # Query document count
    doc_result = await db.execute(
        select(func.count(Document.id)).where(Document.project_id == project_id)
    )
    doc_count = doc_result.scalar_one()
    
    # Query chunk count
    chunk_result = await db.execute(
        select(func.count(DocumentChunk.id)).where(DocumentChunk.project_id == project_id)
    )
    chunk_count = chunk_result.scalar_one()
    
    # Query conversation count
    conv_result = await db.execute(
        select(func.count(Conversation.id)).where(Conversation.project_id == project_id)
    )
    conv_count = conv_result.scalar_one()
    
    return {
        "document_count": doc_count,
        "chunk_count": chunk_count,
        "conversation_count": conv_count
    }
