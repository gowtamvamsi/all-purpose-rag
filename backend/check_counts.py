import asyncio
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from backend.database import SessionLocal
from backend.models.document import Document
from sqlalchemy import func

async def main():
    async with SessionLocal() as db:
        res = await db.execute(select(Document.status, func.count(Document.id)).group_by(Document.status))
        counts = res.all()
        for status, count in counts:
            print(f"{status}: {count}")

if __name__ == "__main__":
    asyncio.run(main())
