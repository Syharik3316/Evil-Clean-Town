import asyncio
import json
import logging

import firebase_admin
from firebase_admin import credentials, messaging
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.notification import FcmDevice, PushSubscription

logger = logging.getLogger(__name__)

# related_entity_type (см. Notification) -> куда вести по клику на push-уведомление
_ENTITY_URLS = {
    "event": lambda entity_id: f"/events/{entity_id}",
    "event_bonus": lambda entity_id: "/profile",
    "lesson": lambda entity_id: f"/lessons/{entity_id}",
    "report": lambda entity_id: "/reports",
    "ticket": lambda entity_id: "/tickets",
}


def _build_url(related_entity_type: str | None, related_entity_id: int | None) -> str:
    builder = _ENTITY_URLS.get(related_entity_type or "")
    if builder is not None and related_entity_id is not None:
        return builder(related_entity_id)
    return "/notifications"


def _send_one(subscription: PushSubscription, payload: str) -> int | None:
    """Блокирующий сетевой вызов к push-сервису браузера (выполняется в отдельном
    треде — pywebpush использует requests, а не httpx/asyncio). Возвращает код
    ответа, если подписку нужно считать недействительной (404/410), иначе None."""
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
        )
        return None
    except WebPushException as exc:
        if exc.status_code in (404, 410):
            return exc.status_code
        logger.warning("Web push не доставлен: %s", exc)
        return None
    except Exception:  # сетевые сбои пуша не должны валить основной запрос
        logger.exception("Web push: непредвиденная ошибка отправки")
        return None


async def send_web_push(
    db: AsyncSession,
    user_id: int,
    title: str,
    body: str | None,
    related_entity_type: str | None = None,
    related_entity_id: int | None = None,
) -> None:
    if not settings.vapid_public_key or not settings.vapid_private_key:
        return

    result = await db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
    subscriptions = result.scalars().all()
    if not subscriptions:
        return

    # ensure_ascii=False: тексты в основном на русском, \uXXXX-эскейпы утроили бы байтовый
    # размер полезной нагрузки против лимита push-сервиса (~4 КБ на aes128gcm)
    payload = json.dumps(
        {"title": title, "body": body or "", "url": _build_url(related_entity_type, related_entity_id)},
        ensure_ascii=False,
    )

    stale_ids = []
    for sub in subscriptions:
        status_code = await asyncio.to_thread(_send_one, sub, payload)
        if status_code is not None:
            stale_ids.append(sub.id)

    if stale_ids:
        await db.execute(delete(PushSubscription).where(PushSubscription.id.in_(stale_ids)))


# ------------------------------------------------------------------------------------
# Firebase Cloud Messaging (пуши в мобильное приложение Capacitor/Android, даже когда
# оно полностью закрыто — в отличие от Web Push, который живёт, пока браузер знает о
# Service Worker'е). Настройка: FIREBASE_CREDENTIALS_JSON в .env (см. .env.example).

_fcm_app: firebase_admin.App | None = None
_fcm_init_failed = False


def _get_fcm_app() -> firebase_admin.App | None:
    global _fcm_app, _fcm_init_failed
    if _fcm_app is not None or _fcm_init_failed:
        return _fcm_app
    if not settings.firebase_credentials_json:
        _fcm_init_failed = True
        return None
    try:
        cred = credentials.Certificate(json.loads(settings.firebase_credentials_json))
        _fcm_app = firebase_admin.initialize_app(cred, name="goodwill-fcm")
    except Exception:
        logger.exception("FCM: не удалось инициализировать firebase-admin (проверьте FIREBASE_CREDENTIALS_JSON)")
        _fcm_init_failed = True
    return _fcm_app


def _send_one_fcm(app: firebase_admin.App, device: FcmDevice, title: str, body: str, url: str) -> bool:
    """Блокирующий вызов Firebase Admin SDK (выполняется в отдельном треде, как и
    _send_one для Web Push). Возвращает True, если токен нужно считать недействительным
    и удалить (устройство отписалось/приложение удалено)."""
    try:
        messaging.send(
            messaging.Message(
                notification=messaging.Notification(title=title, body=body),
                data={"url": url},
                token=device.token,
                android=messaging.AndroidConfig(priority="high"),
            ),
            app=app,
        )
        return False
    except messaging.UnregisteredError:
        return True
    except Exception:
        logger.exception("FCM push не доставлен")
        return False


async def send_fcm_push(
    db: AsyncSession,
    user_id: int,
    title: str,
    body: str | None,
    related_entity_type: str | None = None,
    related_entity_id: int | None = None,
) -> None:
    app = _get_fcm_app()
    if app is None:
        return

    result = await db.execute(select(FcmDevice).where(FcmDevice.user_id == user_id))
    devices = result.scalars().all()
    if not devices:
        return

    url = _build_url(related_entity_type, related_entity_id)
    stale_ids = []
    for device in devices:
        if await asyncio.to_thread(_send_one_fcm, app, device, title, body or "", url):
            stale_ids.append(device.id)

    if stale_ids:
        await db.execute(delete(FcmDevice).where(FcmDevice.id.in_(stale_ids)))
