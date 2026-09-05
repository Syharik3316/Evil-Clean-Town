"""Идемпотентный бутстрап единственного администратора из .env (ADMIN_USERNAME/EMAIL/PASSWORD).

Запускается всегда при старте (entrypoint.sh), отдельно от сидинга справочного контента.
Если админ с ADMIN_USERNAME уже существует — ничего не делает (не трогает пароль,
который мог быть сменён через приложение).
"""
import asyncio
import logging

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)


async def seed_admin() -> None:
    if not (settings.admin_username and settings.admin_email and settings.admin_password):
        logger.info("Admin bootstrap skipped: ADMIN_USERNAME/ADMIN_EMAIL/ADMIN_PASSWORD not fully set in .env")
        return

    async with AsyncSessionLocal() as db:
        existing = await db.execute(
            select(User).where(
                (User.username == settings.admin_username) | (User.email == settings.admin_email)
            )
        )
        if existing.scalar_one_or_none() is not None:
            logger.info("Admin bootstrap skipped: a user with this username/email already exists")
            return

        admin = User(
            username=settings.admin_username,
            email=settings.admin_email,
            password_hash=hash_password(settings.admin_password),
            display_name="Администратор",
            role=UserRole.admin,
            email_verified=True,
        )
        db.add(admin)
        await db.commit()
        logger.info("Admin bootstrapped from .env: %s", settings.admin_username)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(seed_admin())
