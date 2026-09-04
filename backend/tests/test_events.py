from datetime import datetime, timedelta, timezone

import pytest

from app.models.gamification import Achievement, AchievementCriteria
from app.models.user import UserRole
from tests.helpers import auth_headers, create_user, login

pytestmark = pytest.mark.asyncio

EVENT_LAT, EVENT_LON = 44.8951, 37.3168


async def _create_event(client, organizer_token) -> int:
    res = await client.post(
        "/api/v1/events",
        json={
            "title": "Уборка",
            "description": "Собираемся у пляжа",
            "event_type": "cleanup",
            "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "lat": EVENT_LAT,
            "lon": EVENT_LON,
            "points_reward": 20,
        },
        headers=auth_headers(organizer_token),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


async def test_volunteer_cannot_create_event(client, db_session):
    await create_user(db_session, "vol@example.com", UserRole.volunteer)
    token = await login(client, "vol@example.com")
    res = await client.post(
        "/api/v1/events",
        json={
            "title": "x", "description": "x", "starts_at": datetime.now(timezone.utc).isoformat(),
            "lat": 0, "lon": 0,
        },
        headers=auth_headers(token),
    )
    assert res.status_code == 403


async def test_register_and_checkin_flow(client, db_session):
    await create_user(db_session, "org@example.com", UserRole.organizer)
    org_token = await login(client, "org@example.com")
    event_id = await _create_event(client, org_token)

    db_session.add(
        Achievement(
            code="first_event", title="Первая уборка", description="...", icon="🧹",
            criteria_type=AchievementCriteria.events_attended, criteria_value=1, points_reward=15,
        )
    )
    await db_session.commit()

    await create_user(db_session, "vol2@example.com", UserRole.volunteer)
    vol_token = await login(client, "vol2@example.com")

    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    assert res.status_code == 201

    # duplicate registration rejected
    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    assert res.status_code == 409

    # checkin far from the event location is rejected
    res = await client.post(
        f"/api/v1/events/{event_id}/checkin", json={"lat": 0, "lon": 0}, headers=auth_headers(vol_token)
    )
    assert res.status_code == 400

    # checkin at the event location succeeds and awards points
    res = await client.post(
        f"/api/v1/events/{event_id}/checkin",
        json={"lat": EVENT_LAT, "lon": EVENT_LON},
        headers=auth_headers(vol_token),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "checked_in"

    me = await client.get("/api/v1/users/me", headers=auth_headers(vol_token))
    assert me.json()["points_total"] == 35  # 20 event points + 15 "first event" achievement bonus

    # repeat checkin rejected
    res = await client.post(
        f"/api/v1/events/{event_id}/checkin",
        json={"lat": EVENT_LAT, "lon": EVENT_LON},
        headers=auth_headers(vol_token),
    )
    assert res.status_code == 409
