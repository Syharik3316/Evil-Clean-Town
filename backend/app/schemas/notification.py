from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    title: str
    body: str | None
    related_entity_type: str | None
    related_entity_id: int | None
    read_at: datetime | None
    created_at: datetime


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionCreate(BaseModel):
    """Форма ровно повторяет subscription.toJSON() из Push API браузера."""

    endpoint: str
    keys: PushSubscriptionKeys


class PushUnsubscribeRequest(BaseModel):
    endpoint: str


class FcmTokenRegister(BaseModel):
    """Токен устройства, полученный от @capacitor/push-notifications (событие 'registration')."""

    token: str


class FcmTokenUnregister(BaseModel):
    token: str
