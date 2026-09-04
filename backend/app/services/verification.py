import hashlib
import secrets
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.mixins import ensure_aware, utcnow
from app.models.user import User
from app.models.verification import EmailVerificationCode
from app.services.email import send_verification_code

MAX_CODE_ATTEMPTS = 5


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


async def issue_email_verification_code(db: AsyncSession, user: User) -> None:
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(
        EmailVerificationCode(
            user_id=user.id,
            code_hash=_hash_code(code),
            expires_at=utcnow() + timedelta(minutes=settings.email_verification_code_ttl_minutes),
        )
    )
    await db.flush()
    await send_verification_code(user.email, code)


async def consume_email_verification_code(db: AsyncSession, user: User, code: str) -> bool:
    result = await db.execute(
        select(EmailVerificationCode)
        .where(EmailVerificationCode.user_id == user.id, EmailVerificationCode.consumed_at.is_(None))
        .order_by(EmailVerificationCode.created_at.desc())
    )
    record = result.scalars().first()
    if record is None or ensure_aware(record.expires_at) < utcnow():
        return False
    if record.attempts >= MAX_CODE_ATTEMPTS:
        return False

    if record.code_hash != _hash_code(code):
        record.attempts += 1
        return False

    record.consumed_at = utcnow()
    return True
