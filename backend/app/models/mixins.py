from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.orm import Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_aware(value: datetime) -> datetime:
    """SQLite (в отличие от Postgres) не сохраняет tzinfo для DateTime(timezone=True) —
    значения, прочитанные обратно, приходят наивными. Приводим к UTC перед сравнением
    в Python, чтобы код одинаково работал на sqlite (тесты/dev) и Postgres (прод)."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
