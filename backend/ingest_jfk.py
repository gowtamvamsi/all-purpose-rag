import asyncio
import os
import uuid
import sys
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession
from backend.database import SessionLocal
from backend.models.document import Document
from backend.workers.ingestion import process_document

async def main():
    project_id = uuid.UUID("2a1f9ed9-2582-4728-bf70-63ccd526e039")
    pdf_dir = os.path.abspath("jfk_pdfs")
    
    if not os.path.exists(pdf_dir):
        print(f"Directory {pdf_dir} does not exist.")
        return

    pdf_files = [f for f in os.listdir(pdf_dir) if f.lower().endswith(".pdf")]
    print(f"Found {len(pdf_files)} PDFs.")

    async with SessionLocal() as db:
        # Check how many are already there
        from sqlalchemy import select
        res = await db.execute(select(Document).where(Document.project_id == project_id))
        existing = {doc.name for doc in res.scalars().all()}
        
        to_process = []
        for pdf_file in pdf_files:
            if pdf_file in existing:
                continue
                
            file_path = os.path.join(pdf_dir, pdf_file)
            file_size = os.path.getsize(file_path)
            
            doc_id = uuid.uuid4()
            doc = Document(
                id=doc_id,
                project_id=project_id,
                name=pdf_file,
                file_type="pdf",
                mime_type="application/pdf",
                file_size_bytes=file_size,
                s3_key=file_path,
                s3_bucket="local",
                status="pending"
            )
            db.add(doc)
            to_process.append(doc_id)
            
        if to_process:
            await db.commit()
            print(f"Inserted {len(to_process)} documents into the database.")
            
            # Queue them in celery
            # Just queue the first 10 for now so it doesn't overwhelm the local worker and show fast results.
            # We can queue the rest later if needed.
            batch = to_process[:25] 
            print(f"Queueing {len(batch)} tasks in Celery...")
            for doc_id in batch:
                process_document.delay(str(doc_id))
            print("Queued.")
        else:
            print("No new documents to insert.")

if __name__ == "__main__":
    asyncio.run(main())
