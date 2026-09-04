from datetime import datetime, timedelta, timezone

import pytest

from app.models.event import Event, EventStatus
from app.models.gamification import Achievement, AchievementCriteria
from app.models.site import CoastlineSite
from app.models.user import UserRole
from tests.helpers import auth_headers, create_user, login

pytestmark = pytest.mark.asyncio

EVENT_LAT, EVENT_LON = 44.8951, 37.3168


async def _create_site(db_session) -> int:
    site = CoastlineSite(name="Тестовый пляж", region="Тестовый регион", lat=EVENT_LAT, lon=EVENT_LON)
    db_session.add(site)
    await db_session.commit()
    await db_session.refresh(site)
    return site.id


async def _create_event(client, db_session, organizer_token, site_id: int, **overrides) -> int:
    payload = {
        "title": "Уборка",
        "description": "Собираемся у пляжа",
        "event_type": "cleanup",
        "site_id": site_id,
        "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "lat": EVENT_LAT,
        "lon": EVENT_LON,
        "points_reward": 20,
    }
    payload.update(overrides)
    res = await client.post("/api/v1/events", json=payload, headers=auth_headers(organizer_token))
    assert res.status_code == 201, res.text
    event_id = res.json()["id"]

    # create_event всегда создаёт pending_review (ждёт модерации админом, раздел 3) —
    # тесты этого файла проверяют не саму модерацию (см. test_tickets.py), а поведение
    # уже опубликованного мероприятия, поэтому публикуем его напрямую в БД.
    event = await db_session.get(Event, event_id)
    event.status = EventStatus.published
    await db_session.commit()
    return event_id


async def test_volunteer_can_propose_event_pending_review(client, db_session):
    await create_user(db_session, "vol@example.com", UserRole.volunteer)
    token = await login(client, "vol@example.com")
    res = await client.post(
        "/api/v1/events",
        json={
            "title": "Квест", "description": "x", "event_type": "quest",
            "starts_at": datetime.now(timezone.utc).isoformat(), "lat": 0, "lon": 0,
        },
        headers=auth_headers(token),
    )
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "pending_review"

    # мероприятие ещё не опубликовано — в общем списке его нет
    res = await client.get("/api/v1/events")
    assert res.json() == []


async def test_admin_cannot_create_event(client, db_session):
    await create_user(db_session, "admin1@example.com", UserRole.admin)
    token = await login(client, "admin1@example.com")
    res = await client.post(
        "/api/v1/events",
        json={
            "title": "x", "description": "x", "starts_at": datetime.now(timezone.utc).isoformat(),
            "lat": 0, "lon": 0,
        },
        headers=auth_headers(token),
    )
    assert res.status_code == 403


async def test_cleanup_event_requires_site(client, db_session):
    await create_user(db_session, "org0@example.com", UserRole.organizer)
    token = await login(client, "org0@example.com")
    res = await client.post(
        "/api/v1/events",
        json={
            "title": "Уборка без сайта", "description": "x", "event_type": "cleanup",
            "starts_at": datetime.now(timezone.utc).isoformat(), "lat": 0, "lon": 0,
        },
        headers=auth_headers(token),
    )
    assert res.status_code == 400


async def test_register_approve_checkin_flow(client, db_session):
    await create_user(db_session, "org@example.com", UserRole.organizer)
    org_token = await login(client, "org@example.com")
    site_id = await _create_site(db_session)
    event_id = await _create_event(client, db_session, org_token, site_id)

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
    assert res.status_code == 201, res.text
    reg_id = res.json()["id"]
    assert res.json()["status"] == "pending"

    # duplicate application rejected
    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    assert res.status_code == 409

    # checkin before approval is rejected
    res = await client.post(
        f"/api/v1/events/{event_id}/checkin", json={"lat": EVENT_LAT, "lon": EVENT_LON}, headers=auth_headers(vol_token)
    )
    assert res.status_code == 400

    # organizer approves the application
    res = await client.patch(
        f"/api/v1/events/{event_id}/applicants/{reg_id}", json={"status": "approved"}, headers=auth_headers(org_token)
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "approved"

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


async def test_cleanup_registration_requires_age_verification(client, db_session):
    await create_user(db_session, "org2@example.com", UserRole.organizer)
    org_token = await login(client, "org2@example.com")
    site_id = await _create_site(db_session)
    event_id = await _create_event(client, db_session, org_token, site_id)

    await create_user(db_session, "minor@example.com", UserRole.volunteer, age_verified=False)
    vol_token = await login(client, "minor@example.com")

    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    assert res.status_code == 403


async def test_admin_cannot_register_for_event(client, db_session):
    await create_user(db_session, "org3@example.com", UserRole.organizer)
    org_token = await login(client, "org3@example.com")
    site_id = await _create_site(db_session)
    event_id = await _create_event(client, db_session, org_token, site_id)

    await create_user(db_session, "admin2@example.com", UserRole.admin)
    admin_token = await login(client, "admin2@example.com")

    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(admin_token))
    assert res.status_code == 403


async def test_organizer_cannot_register_for_event(client, db_session):
    await create_user(db_session, "org3b@example.com", UserRole.organizer)
    org_token = await login(client, "org3b@example.com")
    site_id = await _create_site(db_session)
    event_id = await _create_event(client, db_session, org_token, site_id)

    await create_user(db_session, "org3c@example.com", UserRole.organizer)
    other_org_token = await login(client, "org3c@example.com")

    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(other_org_token))
    assert res.status_code == 403


async def test_organizer_cannot_checkin(client, db_session):
    await create_user(db_session, "org3d@example.com", UserRole.organizer)
    org_token = await login(client, "org3d@example.com")
    site_id = await _create_site(db_session)
    event_id = await _create_event(client, db_session, org_token, site_id)

    await create_user(db_session, "org3e@example.com", UserRole.organizer)
    other_org_token = await login(client, "org3e@example.com")

    res = await client.post(
        f"/api/v1/events/{event_id}/checkin",
        json={"lat": EVENT_LAT, "lon": EVENT_LON},
        headers=auth_headers(other_org_token),
    )
    assert res.status_code == 403


async def test_close_registration_blocks_new_applications(client, db_session):
    await create_user(db_session, "org4@example.com", UserRole.organizer)
    org_token = await login(client, "org4@example.com")
    site_id = await _create_site(db_session)
    event_id = await _create_event(client, db_session, org_token, site_id)

    res = await client.post(f"/api/v1/events/{event_id}/close-registration", headers=auth_headers(org_token))
    assert res.status_code == 200
    assert res.json()["applications_closed_at"] is not None

    await create_user(db_session, "late@example.com", UserRole.volunteer)
    vol_token = await login(client, "late@example.com")
    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    assert res.status_code == 409


async def test_event_roles_and_applicant_rejection_reason(client, db_session):
    await create_user(db_session, "org5@example.com", UserRole.organizer)
    org_token = await login(client, "org5@example.com")
    site_id = await _create_site(db_session)
    event_id = await _create_event(
        client, db_session, org_token, site_id, roles=[{"title": "Фотограф", "capacity": 1}]
    )

    event = (await client.get(f"/api/v1/events/{event_id}")).json()
    role_id = event["roles"][0]["id"]

    await create_user(db_session, "vol6@example.com", UserRole.volunteer)
    vol_token = await login(client, "vol6@example.com")
    res = await client.post(
        f"/api/v1/events/{event_id}/register", json={"role_id": role_id}, headers=auth_headers(vol_token)
    )
    assert res.status_code == 201
    reg_id = res.json()["id"]
    assert res.json()["role_id"] == role_id

    # reject without reason is rejected
    res = await client.patch(
        f"/api/v1/events/{event_id}/applicants/{reg_id}", json={"status": "rejected"}, headers=auth_headers(org_token)
    )
    assert res.status_code == 400

    res = await client.patch(
        f"/api/v1/events/{event_id}/applicants/{reg_id}",
        json={"status": "rejected", "reason": "Мест больше нет"},
        headers=auth_headers(org_token),
    )
    assert res.status_code == 200
    assert res.json()["rejection_reason"] == "Мест больше нет"


async def test_applicants_list_includes_volunteer_profile(client, db_session):
    await create_user(db_session, "org6@example.com", UserRole.organizer)
    org_token = await login(client, "org6@example.com")
    site_id = await _create_site(db_session)
    event_id = await _create_event(client, db_session, org_token, site_id)

    await create_user(db_session, "vol7@example.com", UserRole.volunteer)
    vol_token = await login(client, "vol7@example.com")
    await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))

    res = await client.get(f"/api/v1/events/{event_id}/applicants", headers=auth_headers(org_token))
    assert res.status_code == 200
    applicants = res.json()
    assert len(applicants) == 1
    assert applicants[0]["volunteer"]["display_name"] == "vol7"


async def test_mine_only_lists_organizers_own_events(client, db_session):
    await create_user(db_session, "org8@example.com", UserRole.organizer)
    org_token = await login(client, "org8@example.com")
    site_id = await _create_site(db_session)
    await _create_event(client, db_session, org_token, site_id)

    await create_user(db_session, "org9@example.com", UserRole.organizer)
    other_token = await login(client, "org9@example.com")

    res = await client.get("/api/v1/events?mine_only=true", headers=auth_headers(org_token))
    assert res.status_code == 200
    assert len(res.json()) == 1

    res = await client.get("/api/v1/events?mine_only=true", headers=auth_headers(other_token))
    assert res.status_code == 200
    assert len(res.json()) == 0

    res = await client.get("/api/v1/events?mine_only=true")
    assert res.status_code == 401


async def test_bonus_points_awarded_by_organizer(client, db_session):
    await create_user(db_session, "org7@example.com", UserRole.organizer)
    org_token = await login(client, "org7@example.com")
    site_id = await _create_site(db_session)
    event_id = await _create_event(client, db_session, org_token, site_id)

    await create_user(db_session, "vol8@example.com", UserRole.volunteer)
    vol_token = await login(client, "vol8@example.com")
    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    reg_id = res.json()["id"]

    res = await client.post(
        f"/api/v1/events/{event_id}/applicants/{reg_id}/bonus-points",
        json={"amount": 10, "reason": "Отличная работа"},
        headers=auth_headers(org_token),
    )
    assert res.status_code == 200, res.text

    me = await client.get("/api/v1/users/me", headers=auth_headers(vol_token))
    assert me.json()["points_total"] == 10
