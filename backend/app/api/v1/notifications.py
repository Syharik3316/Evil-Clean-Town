from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, get_db
from app.models.mixins import utcnow
from app.models.notification import FcmDevice, Notification, PushSubscription
from app.models.user import User
from app.schemas.notification import (
    FcmTokenRegister,
    FcmTokenUnregister,
    NotificationOut,
    PushSubscriptionCreate,
    PushUnsubscribeRequest,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/unread-count")
async def unread_count(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    return {"count": result.scalar_one()}


@router.post("/{notification_id}/read", response_model=NotificationOut)
async def mark_read(
    notification_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    notification = await db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Уведомление не найдено")
    if notification.read_at is None:
        notification.read_at = utcnow()
        await db.commit()
        await db.refresh(notification)
    return notification


@router.post("/read-all")
async def mark_all_read(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    now = utcnow()
    count = 0
    for notification in result.scalars().all():
        notification.read_at = now
        count += 1
    await db.commit()
    return {"marked": count}


@router.get("/push/public-key")
async def push_public_key():
    """Публичный VAPID-ключ для frontend/js/push.js (pushManager.subscribe).

    Пустая строка означает, что Web Push не настроен на сервере (см. .env) —
    фронтенд в этом случае просто не показывает переключатель подписки."""
    return {"public_key": settings.vapid_public_key}


@router.post("/push/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def push_subscribe(
    payload: PushSubscriptionCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    existing = await db.execute(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    subscription = existing.scalar_one_or_none()
    if subscription is None:
        db.add(
            PushSubscription(
                user_id=user.id,
                endpoint=payload.endpoint,
                p256dh=payload.keys.p256dh,
                auth=payload.keys.auth,
            )
        )
    else:
        # то же устройство могло переподписаться (новый ключ) или перейти к другому пользователю
        subscription.user_id = user.id
        subscription.p256dh = payload.keys.p256dh
        subscription.auth = payload.keys.auth
    await db.commit()


@router.post("/push/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def push_unsubscribe(
    payload: PushUnsubscribeRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint, PushSubscription.user_id == user.id
        )
    )
    await db.commit()


@router.post("/push/fcm/register", status_code=status.HTTP_204_NO_CONTENT)
async def fcm_register(
    payload: FcmTokenRegister, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Регистрация токена устройства из мобильного приложения (Capacitor,
    @capacitor/push-notifications, событие 'registration'). См. app/services/push.py."""
    existing = await db.execute(select(FcmDevice).where(FcmDevice.token == payload.token))
    device = existing.scalar_one_or_none()
    if device is None:
        db.add(FcmDevice(user_id=user.id, token=payload.token))
    else:
        # то же устройство могло переустановить приложение под другим пользователем
        device.user_id = user.id
    await db.commit()


@router.post("/push/fcm/unregister", status_code=status.HTTP_204_NO_CONTENT)
async def fcm_unregister(
    payload: FcmTokenUnregister, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await db.execute(delete(FcmDevice).where(FcmDevice.token == payload.token, FcmDevice.user_id == user.id))
    await db.commit()
