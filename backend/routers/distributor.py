from datetime import datetime, timedelta
import io
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_

from backend.database import get_db
from backend.models.document import Document
from backend.models.distributed_task import DistributedTask
from backend.services.storage_service import storage_service

router = APIRouter(prefix="/distributor", tags=["distributor"])

import redis

# Redis client for shared worker state across processes
redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

class TaskResultPayload(BaseModel):
    result_text: str

class WorkerPingPayload(BaseModel):
    worker_id: str
    worker_type: str = "browser"
    hardware: str = "cpu"
    vram_gb: int = 0

def get_online_workers() -> list[str]:
    # Fetch all keys matching worker prefix
    keys = redis_client.keys("worker:*")
    workers = [k.split("worker:")[1] for k in keys]
    return workers

@router.post("/workers/ping")
async def ping_worker(payload: WorkerPingPayload):
    """Worker keep-alive endpoint."""
    import json
    data = payload.dict()
    redis_client.setex(f"worker:{payload.worker_id}", 15, json.dumps(data))
    
    # Get all workers and their data
    keys = redis_client.keys("worker:*")
    workers_data = [json.loads(redis_client.get(k)) for k in keys if redis_client.get(k)]
    
    return {"status": "ok", "active_workers_count": len(workers_data), "online_workers": [w['worker_id'] for w in workers_data], "workers_data": workers_data}

@router.get("/tasks")
async def get_task(worker_id: str, hardware: str = "cpu", db: AsyncSession = Depends(get_db)):
    """Fetch a pending page task and assign it to the worker."""
    # Refresh worker status if polling
    import json
    existing = redis_client.get(f"worker:{worker_id}")
    if existing:
        redis_client.setex(f"worker:{worker_id}", 15, existing)
    
    # Query one pending task matching the hardware
    result = await db.execute(
        select(DistributedTask)
        .where(
            and_(
                DistributedTask.status == "pending",
                DistributedTask.required_hardware == hardware
            )
        )
        .order_by(DistributedTask.created_at.asc())
        .limit(1)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        return {"task": None}
        
    # Mark task as processing and assign it
    task.status = "processing"
    task.assigned_to = worker_id
    task.updated_at = datetime.now()
    await db.commit()
    
    return {
        "task": {
            "task_id": str(task.id),
            "document_id": str(task.document_id) if task.document_id else None,
            "page_number": task.page_number,
            "task_type": task.task_type,
            "payload": task.payload
        }
    }

@router.post("/tasks/{task_id}/result")
async def submit_result(task_id: UUID, payload: TaskResultPayload, db: AsyncSession = Depends(get_db)):
    """Receives results from a grid worker."""
    result = await db.execute(
        select(DistributedTask).where(DistributedTask.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
        
    task.status = "completed"
    task.result_text = payload.result_text
    task.updated_at = datetime.now()
    await db.commit()
    return {"success": True}

@router.get("/documents/{document_id}/file")
async def get_document_file(document_id: UUID, db: AsyncSession = Depends(get_db)):
    """Downloads raw file bytes of a document."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
        
    file_bytes = storage_service.get_file_bytes(doc.s3_bucket, doc.s3_key)
    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=doc.mime_type or "application/pdf"
    )

@router.get("/status")
async def get_grid_status(db: AsyncSession = Depends(get_db)):
    """Get active workers and task queue metrics."""
    online = get_online_workers()
    
    result = await db.execute(select(DistributedTask.status))
    tasks = result.scalars().all()
    
    completed = sum(1 for t in tasks if t == "completed")
    pending = sum(1 for t in tasks if t == "pending")
    processing = sum(1 for t in tasks if t == "processing")
    failed = sum(1 for t in tasks if t == "failed")
    
    return {
        "active_workers_count": len(online),
        "online_workers": online,
        "metrics": {
            "completed": completed,
            "pending": pending,
            "processing": processing,
            "failed": failed,
            "total": len(tasks)
        }
    }
