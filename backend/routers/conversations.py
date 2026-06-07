import json
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_
from uuid import UUID

from backend.database import get_db, SessionLocal
from backend.models.user import User
from backend.models.project import Project
from backend.models.document import Document
from backend.models.conversation import Conversation
from backend.models.message import Message
from backend.models.message_source import MessageSource
from backend.models.chunk import DocumentChunk
from backend.schemas.conversation import ConversationCreate, ConversationResponse
from backend.schemas.message import MessageCreate, MessageResponse, MessageSourceResponse
from backend.services.auth_service import get_current_user
from backend.services.rag_service import rag_service
from backend.routers.projects import get_project_or_404

router = APIRouter(prefix="/projects/{project_id}/conversations", tags=["conversations"])

async def get_conversation_or_404(
    project_id: UUID,
    conversation_id: UUID,
    current_user: User,
    db: AsyncSession
) -> Conversation:
    # Ensure project belongs to owner
    await get_project_or_404(project_id, current_user, db)
    
    result = await db.execute(
        select(Conversation).where(
            Conversation.project_id == project_id,
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    return conv

@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    project_id: UUID,
    payload: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await get_project_or_404(project_id, current_user, db)
    
    title = payload.title if payload.title else "New Conversation"
    conv = Conversation(
        project_id=project_id,
        user_id=current_user.id,
        title=title
    )
    db.add(conv)
    await db.flush()
    return conv

@router.get("", response_model=list[ConversationResponse])
async def list_conversations(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await get_project_or_404(project_id, current_user, db)
    
    result = await db.execute(
        select(Conversation).where(
            Conversation.project_id == project_id,
            Conversation.user_id == current_user.id
        ).order_by(Conversation.created_at.desc())
    )
    return result.scalars().all()

@router.get("/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    project_id: UUID,
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await get_conversation_or_404(project_id, conversation_id, current_user, db)

@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def rename_conversation(
    project_id: UUID,
    conversation_id: UUID,
    payload: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    conv = await get_conversation_or_404(project_id, conversation_id, current_user, db)
    if payload.title:
        conv.title = payload.title
    await db.flush()
    return conv

@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    project_id: UUID,
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    conv = await get_conversation_or_404(project_id, conversation_id, current_user, db)
    await db.delete(conv)
    await db.commit()

@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    project_id: UUID,
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await get_conversation_or_404(project_id, conversation_id, current_user, db)
    
    # Query messages
    result = await db.execute(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at.asc())
    )
    messages = result.scalars().all()
    
    # Pack sources into the message models
    msg_responses = []
    for msg in messages:
        sources_payload = []
        if msg.role == "assistant":
            # Join search
            stmt = (
                select(MessageSource, DocumentChunk.content, Document.name, DocumentChunk.page_number)
                .join(DocumentChunk, MessageSource.chunk_id == DocumentChunk.id)
                .join(Document, DocumentChunk.document_id == Document.id)
                .where(MessageSource.message_id == msg.id)
            )
            src_results = await db.execute(stmt)
            for src, chunk_content, doc_name, page_number in src_results.all():
                sources_payload.append({
                    "document_name": doc_name,
                    "chunk_content": chunk_content,
                    "page_number": page_number,
                    "similarity_score": src.similarity_score
                })
        
        msg_responses.append({
            "id": msg.id,
            "conversation_id": msg.conversation_id,
            "role": msg.role,
            "content": msg.content,
            "token_count": msg.token_count,
            "created_at": msg.created_at,
            "sources": sources_payload
        })
        
    return msg_responses

@router.post("/{conversation_id}/messages")
async def send_message(
    project_id: UUID,
    conversation_id: UUID,
    payload: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Ensure conversation and project exist
    conv = await get_conversation_or_404(project_id, conversation_id, current_user, db)
    project = await get_project_or_404(project_id, current_user, db)
    
    # 1. Save user message to database
    user_msg = Message(
        conversation_id=conversation_id,
        role="user",
        content=payload.content,
        token_count=len(payload.content.split())
    )
    db.add(user_msg)
    await db.flush()
    
    # If conversation title is "New Conversation", auto-rename it to user message preview
    if conv.title == "New Conversation":
        preview = payload.content[:30] + ("..." if len(payload.content) > 30 else "")
        conv.title = preview
        await db.flush()
        
    # Get conversation history (excluding current user message for RAG query context, or we can fetch it)
    history_result = await db.execute(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at.asc())
    )
    history_messages = history_result.scalars().all()
    
    # We commit the user message and title changes so they are visible
    await db.commit()

    async def sse_generator():
        # SSE streams require text/event-stream headers
        # Inside the generator, we stream from rag_service, then on sources event, we save assistant response
        async for sse_event in rag_service.generate_response_stream(
            db=db,
            project_id=str(project_id),
            query=payload.content,
            history=history_messages[:-1], # History excluding the user message we just added
            system_prompt_override=project.system_prompt,
            top_k=project.retrieval_top_k
        ):
            yield sse_event
            
            # Parse events to persist Assistant responses
            if sse_event.startswith("event: sources"):
                # Format:
                # event: sources
                # data: {"sources": [...], "full_response": "..."}
                try:
                    data_lines = [line for line in sse_event.split("\n") if line.startswith("data: ")]
                    if data_lines:
                        data_json = json.loads(data_lines[0][6:])
                        sources = data_json.get("sources", [])
                        assistant_response = data_json.get("full_response", "")
                        
                        # Open a clean session inside the generator
                        async with SessionLocal() as generator_db:
                            # 1. Save assistant message
                            assistant_msg = Message(
                                conversation_id=conversation_id,
                                role="assistant",
                                content=assistant_response,
                                token_count=len(assistant_response.split())
                            )
                            generator_db.add(assistant_msg)
                            await generator_db.flush()
                            
                            # 2. Link sources
                            for src in sources:
                                chunk_id = src.get("chunk_id")
                                score = src.get("similarity_score", 0.0)
                                if chunk_id:
                                    msg_source = MessageSource(
                                        message_id=assistant_msg.id,
                                        chunk_id=UUID(chunk_id),
                                        similarity_score=score
                                    )
                                    generator_db.add(msg_source)
                                    
                            await generator_db.commit()
                except Exception as e:
                    print(f"Failed to log assistant message and sources inside generator: {e}")

    return StreamingResponse(sse_generator(), media_type="text/event-stream")
