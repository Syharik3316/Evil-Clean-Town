from datetime import datetime, timedelta, timezone

import pytest

from app.models.gamification import Achievement, AchievementCriteria
from app.models.site import CoastlineSite
from app.models.user import Organization, OrganizationLegalType, User, UserRole
from tests.helpers import auth_headers, create_user, login

pytestmark = pytest.mark.asyncio

EVENT_LAT, EVENT_LON = 3.0, 3.0


async def _org_organizer(db_session, email: str) -> tuple[User, Organization]:
    org = Organization(name="Эко Фонд Тест", inn="7707083893", legal_type=OrganizationLegalType.legal_entity, contact_email=email)
    db_session.add(org)
    await db_session.flush()
    user = await create_user(db_session, email, UserRole.organizer)
    user.organization_id = org.id
    await db_session.commit()
    await db_session.refresh(org)
    return user, org


async def test_organization_credited_when_volunteer_earns_points(client, db_session):
    organizer, org = await _org_organizer(db_session, "orgowner2@example.com")
    org_token = await login(client, "orgowner2@example.com")

    site = CoastlineSite(name="G-пляж", lat=EVENT_LAT, lon=EVENT_LON)
    db_session.add(site)
    await db_session.commit()
    await db_session.refresh(site)

    res = await client.post(
        "/api/v1/events",
        json={
            "title": "Уборка G", "description": "x", "event_type": "cleanup", "site_id": site.id,
            "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "lat": EVENT_LAT, "lon": EVENT_LON, "points_reward": 30,
        },
        headers=auth_headers(org_token),
    )
    event_id = res.json()["id"]
    from app.models.event import Event, EventStatus

    event = await db_session.get(Event, event_id)
    event.status = EventStatus.published
    await db_session.commit()

    await create_user(db_session, "volG@example.com", UserRole.volunteer)
    vol_token = await login(client, "volG@example.com")
    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    reg_id = res.json()["id"]
    await client.patch(f"/api/v1/events/{event_id}/applicants/{reg_id}", json={"status": "approved"}, headers=auth_headers(org_token))
    res = await client.post(f"/api/v1/events/{event_id}/checkin", json={"lat": EVENT_LAT, "lon": EVENT_LON}, headers=auth_headers(vol_token))
    assert res.status_code == 200

    await db_session.refresh(org)
    assert org.points_total == 30


async def test_streak_updates_on_first_checkin(client, db_session):
    await create_user(db_session, "orgH@example.com", UserRole.organizer)
    org_token = await login(client, "orgH@example.com")
    site = CoastlineSite(name="H-пляж", lat=EVENT_LAT, lon=EVENT_LON)
    db_session.add(site)
    await db_session.commit()
    await db_session.refresh(site)

    res = await client.post(
        "/api/v1/events",
        json={
            "title": "Уборка H", "description": "x", "event_type": "cleanup", "site_id": site.id,
            "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "lat": EVENT_LAT, "lon": EVENT_LON,
        },
        headers=auth_headers(org_token),
    )
    event_id = res.json()["id"]
    from app.models.event import Event, EventStatus

    event = await db_session.get(Event, event_id)
    event.status = EventStatus.published
    await db_session.commit()

    await create_user(db_session, "volH@example.com", UserRole.volunteer)
    vol_token = await login(client, "volH@example.com")
    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    reg_id = res.json()["id"]
    await client.patch(f"/api/v1/events/{event_id}/applicants/{reg_id}", json={"status": "approved"}, headers=auth_headers(org_token))
    await client.post(f"/api/v1/events/{event_id}/checkin", json={"lat": EVENT_LAT, "lon": EVENT_LON}, headers=auth_headers(vol_token))

    me = await client.get("/api/v1/users/me", headers=auth_headers(vol_token))
    assert me.json()["current_streak"] == 1
    assert me.json()["longest_streak"] == 1


async def test_avatar_frame_requires_unlocked_achievement(client, db_session):
    await create_user(db_session, "framer@example.com", UserRole.volunteer)
    token = await login(client, "framer@example.com")

    res = await client.post("/api/v1/users/me/avatar-frame", json={"frame_code": "gold"}, headers=auth_headers(token))
    assert res.status_code == 400

    res = await client.get("/api/v1/users/me/avatar-frames", headers=auth_headers(token))
    assert res.json()["frames"] == []


async def test_leaderboard_organizations_scope(client, db_session):
    _, org = await _org_organizer(db_session, "orgowner3@example.com")
    org.points_total = 42
    await db_session.commit()

    res = await client.get("/api/v1/leaderboard?scope=organizations")
    assert res.status_code == 200
    names = [r["name"] for r in res.json()]
    assert "Эко Фонд Тест" in names
