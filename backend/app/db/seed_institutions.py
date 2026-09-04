import asyncio
import json
import logging
from pathlib import Path

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.user import Team, TeamType

logger = logging.getLogger(__name__)

DATA_FILE = Path(__file__).parent / "data" / "institutions_rostov.json"

TYPE_BY_KEY = {
    "schools": TeamType.school,
    "universities": TeamType.university,
    "colleges": TeamType.college,
}

DEFAULT_CITY = "Ростов-на-Дону"


async def seed_institutions(db) -> int:
    """Идемпотентно добавляет школы/вузы/колледжи как записи Team, чтобы волонтёр мог
    выбрать своё учреждение в профиле. Безопасно вызывать многократно (в т.ч. на уже
    засеянной БД) — новые записи добавляются только по отсутствующему имени."""
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))

    existing_names = set((await db.execute(select(Team.name))).scalars().all())
    added = 0
    for key, team_type in TYPE_BY_KEY.items():
        for name in data.get(key, []):
            if name in existing_names:
                continue
            db.add(Team(name=name, type=team_type, city=DEFAULT_CITY))
            existing_names.add(name)
            added += 1

    if added:
        await db.commit()
    return added


async def main() -> None:
    async with AsyncSessionLocal() as db:
        added = await seed_institutions(db)
        logger.info("Institutions seeded: %d new", added)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
