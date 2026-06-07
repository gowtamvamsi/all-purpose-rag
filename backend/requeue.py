import asyncio
import os
import sys

# Adjust path to import backend modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.future import select
from sqlalchemy import text
from backend.database import SessionLocal
from backend.models.document import Document
from backend.workers.ingestion import process_document

async def main():
    async with SessionLocal() as db:
        # Find documents that are stuck in 'processing' or 'error' 
        # OR documents that are 'ready' but have 0 chunks
        stmt = text("""
            SELECT id
            FROM documents 
            WHERE status IN ('processing', 'error')
               OR (status = 'ready' AND NOT EXISTS (
                   SELECT 1 FROM document_chunks WHERE document_chunks.document_id = documents.id
               ))
        """)
        
        result = await db.execute(stmt)
        docs_to_requeue = result.fetchall()
        
        print(f"Found {len(docs_to_requeue)} documents to requeue.")
        
        if not docs_to_requeue:
            return

        # Batch update status to pending
        doc_ids = [doc.id for doc in docs_to_requeue]
        update_stmt = text("UPDATE documents SET status = 'pending', error_message = NULL WHERE id = ANY(:doc_ids)")
        await db.execute(update_stmt, {"doc_ids": doc_ids})
        await db.commit()

        count = 0
        for doc in docs_to_requeue:
            # Requeue to Celery
            process_document.delay(str(doc.id))
            count += 1
            if count % 100 == 0:
                print(f"Requeued {count} documents...")
        
        print(f"Successfully requeued {count} documents.")

if __name__ == "__main__":
    asyncio.run(main())
