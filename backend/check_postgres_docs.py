import os
import sys
import asyncio

# Adjust path to find backend modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.database import SessionLocal
from backend.models.document import Document
from sqlalchemy.future import select

async def main():
    async with SessionLocal() as db:
        result = await db.execute(select(Document))
        docs = result.scalars().all()
        print(f"--- POSTGRESQL DOCUMENTS ({len(docs)} total) ---")
        status_counts = {}
        error_examples = []
        for d in docs:
            status_counts[d.status] = status_counts.get(d.status, 0) + 1
            if d.status == 'error' and len(error_examples) < 5:
                error_examples.append((d.name, d.error_message))
                
        print("Statuses:", status_counts)
        if error_examples:
            print("Error Examples:")
            for name, err in error_examples:
                print(f"  Doc: {name}, Error: {err}")

if __name__ == "__main__":
    asyncio.run(main())
