import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.services.push import send_web_push

logger = logging.getLogger(__name__)


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
    # лучшая попытка: пуш на устройства пользователя не должен ронять основной запрос
    try:
        await send_web_push(db, user_id, title, body, related_entity_type, related_entity_id)
    except Exception:
        logger.exception("Web push: не удалось отправить уведомление user_id=%s", user_id)
