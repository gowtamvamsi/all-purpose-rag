import asyncio
from backend.database import SessionLocal
from backend.models.distributed_task import DistributedTask
from sqlalchemy.future import select

async def main():
    async with SessionLocal() as db:
        result = await db.execute(select(DistributedTask.status))
        tasks = result.all()
        print("Total tasks:", len(tasks))
        statuses = {}
        for r in tasks:
            statuses[r[0]] = statuses.get(r[0], 0) + 1
        print(statuses)

asyncio.run(main())
