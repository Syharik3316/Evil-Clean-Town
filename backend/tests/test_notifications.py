from datetime import datetime, timedelta, timezone

import pytest

from app.models.event import Event, EventStatus
from app.models.site import CoastlineSite
from app.models.user import UserRole
from tests.helpers import auth_headers, create_user, login

pytestmark = pytest.mark.asyncio


async def test_notification_lifecycle(client, db_session):
    await create_user(db_session, "org@example.com", UserRole.organizer)
    org_token = await login(client, "org@example.com")
    await create_user(db_session, "vol@example.com", UserRole.volunteer)
    vol_token = await login(client, "vol@example.com")

    site = CoastlineSite(name="Уведомления-пляж", lat=1, lon=1)
    db_session.add(site)
    await db_session.commit()
    await db_session.refresh(site)

    res = await client.post(
        "/api/v1/events",
        json={
            "title": "Уборка", "description": "x", "event_type": "cleanup", "site_id": site.id,
            "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(), "lat": 1, "lon": 1,
        },
        headers=auth_headers(org_token),
    )
    event_id = res.json()["id"]
    event = await db_session.get(Event, event_id)
    event.status = EventStatus.published
    await db_session.commit()

    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    assert res.status_code == 201

    res = await client.get("/api/v1/notifications", headers=auth_headers(vol_token))
    assert res.status_code == 200
    notifications = res.json()
    assert len(notifications) == 1
    assert notifications[0]["type"] == "registration_submitted"
    assert notifications[0]["read_at"] is None
    notification_id = notifications[0]["id"]

    res = await client.get("/api/v1/notifications/unread-count", headers=auth_headers(vol_token))
    assert res.json()["count"] == 1

    res = await client.post(f"/api/v1/notifications/{notification_id}/read", headers=auth_headers(vol_token))
    assert res.status_code == 200
    assert res.json()["read_at"] is not None

    res = await client.get("/api/v1/notifications/unread-count", headers=auth_headers(vol_token))
    assert res.json()["count"] == 0

    res = await client.get("/api/v1/notifications?unread_only=true", headers=auth_headers(vol_token))
    assert res.json() == []


async def test_cannot_read_others_notification(client, db_session):
    await create_user(db_session, "a@example.com", UserRole.volunteer)
    token_a = await login(client, "a@example.com")
    await create_user(db_session, "b@example.com", UserRole.volunteer)
    token_b = await login(client, "b@example.com")

    res = await client.get("/api/v1/notifications", headers=auth_headers(token_a))
    assert res.json() == []

    res = await client.post("/api/v1/notifications/999999/read", headers=auth_headers(token_b))
    assert res.status_code == 404
