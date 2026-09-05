import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.notification import PushSubscription
from app.models.user import User, UserRole
from app.services.notifications import notify
from tests.helpers import auth_headers, create_user, login

pytestmark = pytest.mark.asyncio

FAKE_SUBSCRIPTION = {
    "endpoint": "https://push.example.com/v1/abcd1234",
    "keys": {"p256dh": "fake-p256dh-key", "auth": "fake-auth-secret"},
}


async def test_push_public_key_empty_when_not_configured(client, db_session):
    await create_user(db_session, "pushkey@example.com", UserRole.volunteer)
    token = await login(client, "pushkey@example.com")

    res = await client.get("/api/v1/notifications/push/public-key", headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json()["public_key"] == ""


async def test_push_subscribe_and_unsubscribe(client, db_session):
    user = await create_user(db_session, "pushsub@example.com", UserRole.volunteer)
    token = await login(client, "pushsub@example.com")

    res = await client.post(
        "/api/v1/notifications/push/subscribe", json=FAKE_SUBSCRIPTION, headers=auth_headers(token)
    )
    assert res.status_code == 204

    result = await db_session.execute(
        select(PushSubscription).where(PushSubscription.endpoint == FAKE_SUBSCRIPTION["endpoint"])
    )
    subscription = result.scalar_one()
    assert subscription.user_id == user.id
    assert subscription.p256dh == "fake-p256dh-key"

    res = await client.post(
        "/api/v1/notifications/push/unsubscribe",
        json={"endpoint": FAKE_SUBSCRIPTION["endpoint"]},
        headers=auth_headers(token),
    )
    assert res.status_code == 204

    result = await db_session.execute(
        select(PushSubscription).where(PushSubscription.endpoint == FAKE_SUBSCRIPTION["endpoint"])
    )
    assert result.scalar_one_or_none() is None


async def test_notify_sends_web_push_when_configured(db_session, monkeypatch):
    monkeypatch.setattr(settings, "vapid_public_key", "dummy-public")
    monkeypatch.setattr(settings, "vapid_private_key", "dummy-private")

    user = User(
        username="pushnotify", email="pushnotify@example.com", password_hash="x",
        display_name="Push Notify", role=UserRole.volunteer, email_verified=True,
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(
        PushSubscription(
            user_id=user.id, endpoint=FAKE_SUBSCRIPTION["endpoint"],
            p256dh=FAKE_SUBSCRIPTION["keys"]["p256dh"], auth=FAKE_SUBSCRIPTION["keys"]["auth"],
        )
    )
    await db_session.commit()

    calls = []

    def fake_webpush(subscription_info, data, vapid_private_key, vapid_claims):
        calls.append((subscription_info, data))

    import app.services.push as push_module

    monkeypatch.setattr(push_module, "webpush", fake_webpush)

    await notify(db_session, user.id, type="test", title="Заголовок", body="Текст")
    await db_session.commit()

    assert len(calls) == 1
    subscription_info, payload = calls[0]
    assert subscription_info["endpoint"] == FAKE_SUBSCRIPTION["endpoint"]
    assert "Заголовок" in payload


async def test_notify_removes_stale_subscription_on_410(db_session, monkeypatch):
    monkeypatch.setattr(settings, "vapid_public_key", "dummy-public")
    monkeypatch.setattr(settings, "vapid_private_key", "dummy-private")

    user = User(
        username="pushstale", email="pushstale@example.com", password_hash="x",
        display_name="Push Stale", role=UserRole.volunteer, email_verified=True,
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(
        PushSubscription(
            user_id=user.id, endpoint=FAKE_SUBSCRIPTION["endpoint"],
            p256dh=FAKE_SUBSCRIPTION["keys"]["p256dh"], auth=FAKE_SUBSCRIPTION["keys"]["auth"],
        )
    )
    await db_session.commit()

    import app.services.push as push_module
    from pywebpush import WebPushException

    class FakeResponse:
        status_code = 410

    def fake_webpush(subscription_info, data, vapid_private_key, vapid_claims):
        raise WebPushException("gone", response=FakeResponse())

    monkeypatch.setattr(push_module, "webpush", fake_webpush)

    await notify(db_session, user.id, type="test", title="Заголовок", body="Текст")
    await db_session.commit()

    result = await db_session.execute(
        select(PushSubscription).where(PushSubscription.endpoint == FAKE_SUBSCRIPTION["endpoint"])
    )
    assert result.scalar_one_or_none() is None
