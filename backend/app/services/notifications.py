from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


async def notify(
    db: AsyncSession,
    user_id: int,
    type: str,
    title: str,
    body: str | None = None,
    related_entity_type: str | None = None,
    related_entity_id: int | None = None,
) -> None:
    db.add(
        Notification(
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
        )
    )
