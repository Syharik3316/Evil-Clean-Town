from datetime import datetime, timedelta, timezone

import pytest

from app.models.event import Event, EventStatus
from app.models.gamification import Achievement, AchievementAudience, AchievementCriteria
from app.models.site import CoastlineSite
from app.models.user import Organization, OrganizationLegalType, OrganizationStatus, User, UserRole
from tests.helpers import auth_headers, create_user, login

pytestmark = pytest.mark.asyncio

EVENT_LAT, EVENT_LON = 4.0, 4.0


async def _org_organizer(db_session, email: str) -> tuple[User, Organization]:
    org = Organization(
        name="Тестовый фонд", inn="7707083894", legal_type=OrganizationLegalType.legal_entity,
        contact_email=email, status=OrganizationStatus.approved,
    )
    db_session.add(org)
    await db_session.flush()
    user = await create_user(db_session, email, UserRole.organizer)
    user.organization_id = org.id
    await db_session.commit()
    await db_session.refresh(org)
    return user, org


async def _publish_event(db_session, event_id: int) -> None:
    event = await db_session.get(Event, event_id)
    event.status = EventStatus.published
    await db_session.commit()


async def test_organizer_earns_events_created_achievement(client, db_session):
    db_session.add(
        Achievement(
            code="org_first_event", title="Организатор дебютировал", description="...", icon="🚩",
            audience=AchievementAudience.organizer, criteria_type=AchievementCriteria.events_created,
            criteria_value=1, points_reward=10,
        )
    )
    await db_session.commit()

    _, __ = await _org_organizer(db_session, "orgcreate@example.com")
    org_token = await login(client, "orgcreate@example.com")

    res = await client.post(
        "/api/v1/events",
        json={
            "title": "Вебинар про переработку", "description": "x", "event_type": "webinar",
            "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "lat": EVENT_LAT, "lon": EVENT_LON,
        },
        headers=auth_headers(org_token),
    )
    assert res.status_code == 201, res.text

    achievements = await client.get("/api/v1/users/me/achievements", headers=auth_headers(org_token))
    codes = [a["achievement"]["code"] for a in achievements.json()]
    assert "org_first_event" in codes

    me = await client.get("/api/v1/users/me", headers=auth_headers(org_token))
    assert me.json()["points_total"] == 10


async def test_organizer_earns_event_volunteers_registered_achievement(client, db_session):
    db_session.add(
        Achievement(
            code="org_two_volunteers", title="Полный зал", description="...", icon="👥",
            audience=AchievementAudience.organizer, criteria_type=AchievementCriteria.event_volunteers_registered,
            criteria_value=2, points_reward=20,
        )
    )
    await db_session.commit()

    _, __ = await _org_organizer(db_session, "orgvols@example.com")
    org_token = await login(client, "orgvols@example.com")

    site = CoastlineSite(name="Тест-пляж", lat=EVENT_LAT, lon=EVENT_LON)
    db_session.add(site)
    await db_session.commit()
    await db_session.refresh(site)

    res = await client.post(
        "/api/v1/events",
        json={
            "title": "Уборка пляжа", "description": "x", "event_type": "cleanup", "site_id": site.id,
            "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "lat": EVENT_LAT, "lon": EVENT_LON,
        },
        headers=auth_headers(org_token),
    )
    event_id = res.json()["id"]
    await _publish_event(db_session, event_id)

    for i in range(2):
        email = f"vol_reg_{i}@example.com"
        await create_user(db_session, email, UserRole.volunteer)
        vol_token = await login(client, email)
        res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
        assert res.status_code == 201, res.text

    achievements = await client.get("/api/v1/users/me/achievements", headers=auth_headers(org_token))
    codes = [a["achievement"]["code"] for a in achievements.json()]
    assert "org_two_volunteers" in codes


async def test_organizer_earns_events_completed_achievement_on_checkin(client, db_session):
    db_session.add(
        Achievement(
            code="org_completed", title="Мероприятие состоялось", description="...", icon="✅",
            audience=AchievementAudience.organizer, criteria_type=AchievementCriteria.events_completed,
            criteria_value=1, points_reward=15,
        )
    )
    await db_session.commit()

    _, __ = await _org_organizer(db_session, "orgdone@example.com")
    org_token = await login(client, "orgdone@example.com")

    site = CoastlineSite(name="Пляж завершения", lat=EVENT_LAT, lon=EVENT_LON)
    db_session.add(site)
    await db_session.commit()
    await db_session.refresh(site)

    res = await client.post(
        "/api/v1/events",
        json={
            "title": "Уборка завершения", "description": "x", "event_type": "cleanup", "site_id": site.id,
            "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "lat": EVENT_LAT, "lon": EVENT_LON,
        },
        headers=auth_headers(org_token),
    )
    event_id = res.json()["id"]
    await _publish_event(db_session, event_id)

    await create_user(db_session, "voldone@example.com", UserRole.volunteer)
    vol_token = await login(client, "voldone@example.com")
    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    reg_id = res.json()["id"]
    await client.patch(
        f"/api/v1/events/{event_id}/applicants/{reg_id}", json={"status": "approved"}, headers=auth_headers(org_token)
    )
    res = await client.post(
        f"/api/v1/events/{event_id}/checkin", json={"lat": EVENT_LAT, "lon": EVENT_LON}, headers=auth_headers(vol_token)
    )
    assert res.status_code == 200

    achievements = await client.get("/api/v1/users/me/achievements", headers=auth_headers(org_token))
    codes = [a["achievement"]["code"] for a in achievements.json()]
    assert "org_completed" in codes


async def test_organizer_earns_course_achievements(client, db_session):
    db_session.add_all(
        [
            Achievement(
                code="org_first_course", title="Первый курс", description="...", icon="📗",
                audience=AchievementAudience.organizer, criteria_type=AchievementCriteria.courses_created,
                criteria_value=1, points_reward=10,
            ),
            Achievement(
                code="org_course_completions", title="Курс заходит", description="...", icon="🎯",
                audience=AchievementAudience.organizer, criteria_type=AchievementCriteria.course_completions,
                criteria_value=1, points_reward=25,
            ),
        ]
    )
    await db_session.commit()

    _, __ = await _org_organizer(db_session, "orgcourse@example.com")
    org_token = await login(client, "orgcourse@example.com")

    res = await client.post(
        "/api/v1/lessons",
        json={"title": "Мой курс", "slug": "my-course", "summary": "...", "points_reward": 5},
        headers=auth_headers(org_token),
    )
    assert res.status_code == 201, res.text
    lesson_id = res.json()["id"]

    achievements = await client.get("/api/v1/users/me/achievements", headers=auth_headers(org_token))
    codes = [a["achievement"]["code"] for a in achievements.json()]
    assert "org_first_course" in codes

    from app.models.lesson import Lesson, LessonStatus

    lesson = await db_session.get(Lesson, lesson_id)
    lesson.status = LessonStatus.published
    await db_session.commit()

    await create_user(db_session, "volcourse@example.com", UserRole.volunteer)
    vol_token = await login(client, "volcourse@example.com")
    res = await client.post(
        f"/api/v1/lessons/{lesson_id}/complete", json={"answers": []}, headers=auth_headers(vol_token)
    )
    assert res.status_code == 200, res.text

    achievements = await client.get("/api/v1/users/me/achievements", headers=auth_headers(org_token))
    codes = [a["achievement"]["code"] for a in achievements.json()]
    assert "org_course_completions" in codes


async def test_organizer_does_not_earn_volunteer_only_achievements(client, db_session):
    db_session.add(
        Achievement(
            code="vol_only", title="Только для волонтёров", description="...", icon="⭐",
            audience=AchievementAudience.volunteer, criteria_type=AchievementCriteria.points_threshold,
            criteria_value=0, points_reward=5,
        )
    )
    await db_session.commit()

    _, __ = await _org_organizer(db_session, "orgnovol@example.com")
    org_token = await login(client, "orgnovol@example.com")

    res = await client.post(
        "/api/v1/events",
        json={
            "title": "Вебинар", "description": "x", "event_type": "webinar",
            "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "lat": EVENT_LAT, "lon": EVENT_LON,
        },
        headers=auth_headers(org_token),
    )
    assert res.status_code == 201

    achievements = await client.get("/api/v1/users/me/achievements", headers=auth_headers(org_token))
    codes = [a["achievement"]["code"] for a in achievements.json()]
    assert "vol_only" not in codes
