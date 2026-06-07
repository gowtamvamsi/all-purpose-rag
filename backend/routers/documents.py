import os
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_
from uuid import UUID

from backend.database import get_db
from backend.models.user import User
from backend.models.project import Project
from backend.models.document import Document
from backend.schemas.document import DocumentResponse, DocumentUploadResponse
from backend.services.auth_service import get_current_user
from backend.services.storage_service import storage_service
from backend.routers.projects import get_project_or_404

router = APIRouter(prefix="/projects/{project_id}/documents", tags=["documents"])

def trigger_processing(document_id: str, background_tasks: BackgroundTasks):
    """
    Tries to dispatch document processing to Celery.
    If Celery fails or is not active, falls back to FastAPI background tasks.
    """
    try:
        from backend.workers.ingestion import process_document
        process_document.delay(document_id)
        print(f"Dispatched document {document_id} to Celery.")
    except Exception as e:
        print(f"Celery dispatch failed: {e}. Falling back to FastAPI BackgroundTasks.")
        from backend.workers.ingestion import process_document_async
        # Define a helper function to run the async function inside background task
        def run_async_task(doc_id: str):
            import asyncio
            asyncio.run(process_document_async(doc_id))
        background_tasks.add_task(run_async_task, document_id)

@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_documents(
    project_id: UUID,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Ensure project exists and user owns it
    await get_project_or_404(project_id, current_user, db)
    
    uploaded_docs = []
    
    for file in files:
        # Resolve file type
        filename = file.filename
        file_extension = os.path.splitext(filename)[1].replace(".", "").lower()
        if not file_extension:
            file_extension = "txt" # fallback
            
        # Create Document record
        doc = Document(
            project_id=project_id,
            name=filename,
            file_type=file_extension,
            mime_type=file.content_type or "application/octet-stream",
            file_size_bytes=0, # Temporary
            s3_key="", # Temporary
            s3_bucket="", # Temporary
            status="uploading"
        )
        db.add(doc)
        await db.flush() # Generate document UUID
        
        try:
            # Upload to Storage (S3 or Local)
            bucket, key = await storage_service.upload_file(file, str(project_id), str(doc.id))
            
            # Read size
            await file.seek(0, os.SEEK_END)
            size = await file.tell()
            
            doc.s3_bucket = bucket
            doc.s3_key = key
            doc.file_size_bytes = size
            doc.status = "processing"
            await db.flush()
            
            # Trigger ingestion worker
            trigger_processing(str(doc.id), background_tasks)
            uploaded_docs.append(doc)
            
        except Exception as e:
            doc.status = "error"
            doc.error_message = f"Upload failed: {str(e)}"
            await db.flush()
            
    await db.commit()
    return {"documents": uploaded_docs}

@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Ensure project exists and user owns it
    await get_project_or_404(project_id, current_user, db)
    
    result = await db.execute(
        select(Document)
        .where(Document.project_id == project_id)
        .order_by(Document.status.desc(), Document.updated_at.desc())
    )
    return result.scalars().all()

@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    project_id: UUID,
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await get_project_or_404(project_id, current_user, db)
    
    result = await db.execute(
        select(Document).where(Document.project_id == project_id, Document.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    return doc

@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    project_id: UUID,
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await get_project_or_404(project_id, current_user, db)
    
    result = await db.execute(
        select(Document).where(Document.project_id == project_id, Document.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
        
    # Delete binary file from storage
    storage_service.delete_file(doc.s3_bucket, doc.s3_key)
    
    # Delete document record (cascades to chunks)
    await db.delete(doc)
    await db.commit()

@router.post("/{document_id}/reprocess", response_model=DocumentResponse)
async def reprocess_document(
    project_id: UUID,
    document_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await get_project_or_404(project_id, current_user, db)
    
    result = await db.execute(
        select(Document).where(Document.project_id == project_id, Document.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
        
    doc.status = "processing"
    doc.error_message = None
    await db.commit()
    
    trigger_processing(str(doc.id), background_tasks)
    return doc


from pydantic import BaseModel
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
import httpx

class ImportURLPayload(BaseModel):
    url: str

class PDFLinkExtractor(HTMLParser):
    def __init__(self, base_url):
        super().__init__()
        self.base_url = base_url
        self.pdf_links = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == 'a':
            for attr, value in attrs:
                if attr.lower() == 'href' and value:
                    cleaned_val = value.strip()
                    if cleaned_val.lower().endswith('.pdf') or '.pdf?' in cleaned_val.lower():
                        absolute_url = urljoin(self.base_url, cleaned_val)
                        if absolute_url not in self.pdf_links:
                            self.pdf_links.append(absolute_url)

async def scrape_and_import_pdfs_task(project_id: UUID, source_url: str):
    print(f"[*] Starting scrape task for project {project_id} on URL: {source_url}")
    url = source_url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
        
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=15.0) as client:
            response = await client.get(url)
            if response.status_code != 200:
                print(f"[!] Scrape task failed: HTTP {response.status_code} on {url}")
                return
            html_content = response.text
    except Exception as e:
        print(f"[!] Scrape task request failed: {e}")
        return
        
    extractor = PDFLinkExtractor(url)
    extractor.feed(html_content)
    pdf_links = extractor.pdf_links
    
    print(f"[*] Found {len(pdf_links)} PDF links on the page.")
    if not pdf_links:
        return
        
    from backend.workers.ingestion import get_isolated_db
    db, engine = await get_isolated_db()
    
    try:
        for pdf_url in pdf_links:
            parsed_path = urlparse(pdf_url).path
            filename = os.path.basename(parsed_path) or "downloaded_file.pdf"
            if not filename.lower().endswith(".pdf"):
                filename += ".pdf"
                
            existing_res = await db.execute(
                select(Document).where(Document.project_id == project_id, Document.name == filename)
            )
            if existing_res.scalar_one_or_none():
                print(f"[*] Skipping duplicate document: {filename}")
                continue
                
            doc = Document(
                project_id=project_id,
                name=filename,
                file_type="pdf",
                mime_type="application/pdf",
                file_size_bytes=0,
                s3_key="",
                s3_bucket="",
                status="uploading"
            )
            db.add(doc)
            await db.flush()
            doc_id = str(doc.id)
            
            try:
                print(f"[*] Downloading PDF: {pdf_url}")
                async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=30.0) as client:
                    file_res = await client.get(pdf_url)
                    if file_res.status_code != 200:
                        raise Exception(f"HTTP {file_res.status_code}")
                    file_bytes = file_res.content
                    
                bucket, key = await storage_service.upload_bytes(file_bytes, filename, str(project_id), doc_id)
                
                doc.s3_bucket = bucket
                doc.s3_key = key
                doc.file_size_bytes = len(file_bytes)
                doc.status = "processing"
                await db.commit()
                
                from backend.workers.ingestion import process_document
                process_document.delay(doc_id)
                print(f"[*] Queued document processing for: {filename}")
                
            except Exception as download_err:
                print(f"[!] Failed to download PDF {pdf_url}: {download_err}")
                doc.status = "error"
                doc.error_message = f"Download failed: {str(download_err)}"
                await db.commit()
    finally:
        await db.close()
        await engine.dispose()

@router.post("/import-url", status_code=status.HTTP_202_ACCEPTED)
async def import_url(
    project_id: UUID,
    payload: ImportURLPayload,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await get_project_or_404(project_id, current_user, db)
    background_tasks.add_task(scrape_and_import_pdfs_task, project_id, payload.url)
    return {"status": "started", "message": "PDF scraping and download task started in the background."}

