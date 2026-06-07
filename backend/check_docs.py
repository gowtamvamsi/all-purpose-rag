import asyncio
from backend.database import SessionLocal
from backend.models.document import Document
from sqlalchemy.future import select

async def main():
    async with SessionLocal() as db:
        result = await db.execute(select(Document.status))
        docs = result.all()
        print("Total docs:", len(docs))
        statuses = {}
        for r in docs:
            statuses[r[0]] = statuses.get(r[0], 0) + 1
        print(statuses)

asyncio.run(main())
