import asyncio
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from backend.database import SessionLocal
from backend.models.document import Document
from backend.workers.ingestion import process_document

async def main():
    async with SessionLocal() as db:
        # Select and order by name DESC (which is effectively backward alphabetical order)
        res = await db.execute(
            select(Document)
            .where(Document.status.in_(['pending', 'processing', 'error']))
            .order_by(Document.name.desc())
        )
        docs = res.scalars().all()
        print(f"Total documents to requeue backward: {len(docs)}")
        
        count = 0
        for doc in docs:
            doc.status = 'pending'
            doc.chunk_count = 0
            process_document.delay(str(doc.id))
            count += 1
            
        await db.commit()
        print(f"Re-queued {count} documents in backward order.")

if __name__ == "__main__":
    asyncio.run(main())
