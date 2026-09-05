from datetime import datetime, timedelta, timezone

import pytest

from app.models.site import CoastlineSite
from app.models.user import UserRole
from tests.helpers import auth_headers, create_user, login

pytestmark = pytest.mark.asyncio


async def test_organizer_creates_submits_and_admin_approves_course(client, db_session):
    await create_user(db_session, "orgL@example.com", UserRole.organizer)
    org_token = await login(client, "orgL@example.com")
    await create_user(db_session, "adminL@example.com", UserRole.admin)
    admin_token = await login(client, "adminL@example.com")

    res = await client.post(
        "/api/v1/lessons",
        json={"title": "Курс организатора", "slug": "org-course", "summary": "x", "points_reward": 5},
        headers=auth_headers(org_token),
    )
    assert res.status_code == 201, res.text
    lesson_id = res.json()["id"]
    assert res.json()["status"] == "draft"

    # черновик не виден в общем списке
    res = await client.get("/api/v1/lessons")
    assert res.json() == []

    res = await client.post(
        f"/api/v1/lessons/{lesson_id}/cards",
        json={"title": "Карточка", "body": "Текст"},
        headers=auth_headers(org_token),
    )
    assert res.status_code == 201, res.text

    res = await client.post(f"/api/v1/lessons/{lesson_id}/submit", headers=auth_headers(org_token))
    assert res.status_code == 200
    assert res.json()["status"] == "pending_review"

    res = await client.get("/api/v1/admin/tickets/courses", headers=auth_headers(admin_token))
    assert lesson_id in [c["id"] for c in res.json()]

    res = await client.post(f"/api/v1/admin/tickets/courses/{lesson_id}/approve", headers=auth_headers(admin_token))
    assert res.status_code == 200
    assert res.json()["status"] == "published"

    res = await client.get("/api/v1/lessons")
    assert lesson_id in [c["id"] for c in res.json()]

    res = await client.get("/api/v1/notifications", headers=auth_headers(org_token))
    assert any(n["type"] == "course_approved" for n in res.json())


async def test_video_card_requires_url_and_is_returned_to_public(client, db_session):
    await create_user(db_session, "videoorg@example.com", UserRole.organizer)
    org_token = await login(client, "videoorg@example.com")

    res = await client.post(
        "/api/v1/lessons",
        json={"title": "Видеокурс", "slug": "video-course", "summary": "x", "points_reward": 5},
        headers=auth_headers(org_token),
    )
    lesson_id = res.json()["id"]

    # без video_url видео-карточку создать нельзя
    res = await client.post(
        f"/api/v1/lessons/{lesson_id}/cards",
        json={"title": "Видео", "content_type": "video"},
        headers=auth_headers(org_token),
    )
    assert res.status_code == 422

    res = await client.post(
        f"/api/v1/lessons/{lesson_id}/cards",
        json={"title": "Видео", "content_type": "video", "video_url": "https://example.com/lesson.mp4"},
        headers=auth_headers(org_token),
    )
    assert res.status_code == 201, res.text
    assert res.json()["video_url"] == "https://example.com/lesson.mp4"

    # админ публикует, чтобы карточка стала видна не-автору через публичный эндпоинт
    await create_user(db_session, "videoadmin@example.com", UserRole.admin)
    admin_token = await login(client, "videoadmin@example.com")
    await client.post(f"/api/v1/lessons/{lesson_id}/submit", headers=auth_headers(org_token))
    await client.post(f"/api/v1/admin/tickets/courses/{lesson_id}/approve", headers=auth_headers(admin_token))

    res = await client.get(f"/api/v1/lessons/{lesson_id}")
    assert res.status_code == 200
    cards = res.json()["cards"]
    assert cards[0]["content_type"] == "video"
    assert cards[0]["video_url"] == "https://example.com/lesson.mp4"


async def test_organizer_cannot_edit_others_course(client, db_session):
    await create_user(db_session, "orgM@example.com", UserRole.organizer)
    org_token = await login(client, "orgM@example.com")
    await create_user(db_session, "orgN@example.com", UserRole.organizer)
    other_token = await login(client, "orgN@example.com")

    res = await client.post(
        "/api/v1/lessons",
        json={"title": "Курс M", "slug": "course-m", "summary": "x"},
        headers=auth_headers(org_token),
    )
    lesson_id = res.json()["id"]

    res = await client.patch(
        f"/api/v1/lessons/{lesson_id}", json={"title": "Взлом"}, headers=auth_headers(other_token)
    )
    assert res.status_code == 403


async def test_admin_set_base_course_requires_published(client, db_session):
    await create_user(db_session, "orgO@example.com", UserRole.organizer)
    org_token = await login(client, "orgO@example.com")
    await create_user(db_session, "adminO@example.com", UserRole.admin)
    admin_token = await login(client, "adminO@example.com")

    res = await client.post(
        "/api/v1/lessons",
        json={"title": "Курс O", "slug": "course-o", "summary": "x"},
        headers=auth_headers(org_token),
    )
    lesson_id = res.json()["id"]

    res = await client.post(f"/api/v1/lessons/{lesson_id}/set-base-course", headers=auth_headers(admin_token))
    assert res.status_code == 400

    await client.post(f"/api/v1/lessons/{lesson_id}/submit", headers=auth_headers(org_token))
    await client.post(f"/api/v1/admin/tickets/courses/{lesson_id}/approve", headers=auth_headers(admin_token))

    res = await client.post(f"/api/v1/lessons/{lesson_id}/set-base-course", headers=auth_headers(admin_token))
    assert res.status_code == 200
    assert res.json()["is_base_course"] is True


async def _create_published_course(client, org_token, admin_token, title, slug) -> int:
    res = await client.post(
        "/api/v1/lessons", json={"title": title, "slug": slug, "summary": "x"}, headers=auth_headers(org_token)
    )
    lesson_id = res.json()["id"]
    await client.post(f"/api/v1/lessons/{lesson_id}/submit", headers=auth_headers(org_token))
    await client.post(f"/api/v1/admin/tickets/courses/{lesson_id}/approve", headers=auth_headers(admin_token))
    return lesson_id


async def test_cleanup_registration_requires_base_course(client, db_session):
    await create_user(db_session, "orgP@example.com", UserRole.organizer)
    org_token = await login(client, "orgP@example.com")
    await create_user(db_session, "adminP@example.com", UserRole.admin)
    admin_token = await login(client, "adminP@example.com")

    base_id = await _create_published_course(client, org_token, admin_token, "Базовый курс", "base-p")
    await client.post(f"/api/v1/lessons/{base_id}/set-base-course", headers=auth_headers(admin_token))

    site = CoastlineSite(name="P-пляж", lat=1, lon=1)
    db_session.add(site)
    await db_session.commit()
    await db_session.refresh(site)

    res = await client.post(
        "/api/v1/events",
        json={
            "title": "Уборка P", "description": "x", "event_type": "cleanup", "site_id": site.id,
            "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(), "lat": 1, "lon": 1,
        },
        headers=auth_headers(org_token),
    )
    event_id = res.json()["id"]
    from app.models.event import Event, EventStatus

    event = await db_session.get(Event, event_id)
    event.status = EventStatus.published
    await db_session.commit()

    await create_user(db_session, "volP@example.com", UserRole.volunteer)
    vol_token = await login(client, "volP@example.com")

    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    assert res.status_code == 403
    assert "базовый курс" in res.json()["detail"]

    res = await client.post(f"/api/v1/lessons/{base_id}/complete", json={"answers": []}, headers=auth_headers(vol_token))
    assert res.status_code == 200

    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    assert res.status_code == 201


async def test_event_prerequisite_course_gate(client, db_session):
    await create_user(db_session, "orgQ@example.com", UserRole.organizer)
    org_token = await login(client, "orgQ@example.com")
    await create_user(db_session, "adminQ@example.com", UserRole.admin)
    admin_token = await login(client, "adminQ@example.com")

    prereq_id = await _create_published_course(client, org_token, admin_token, "Спецкурс", "special-q")

    site = CoastlineSite(name="Q-пляж", lat=2, lon=2)
    db_session.add(site)
    await db_session.commit()
    await db_session.refresh(site)

    res = await client.post(
        "/api/v1/events",
        json={
            "title": "Уборка Q", "description": "x", "event_type": "cleanup", "site_id": site.id,
            "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(), "lat": 2, "lon": 2,
        },
        headers=auth_headers(org_token),
    )
    event_id = res.json()["id"]
    from app.models.event import Event, EventStatus

    event = await db_session.get(Event, event_id)
    event.status = EventStatus.published
    await db_session.commit()

    res = await client.post(
        f"/api/v1/events/{event_id}/attach-course", json={"lesson_id": prereq_id}, headers=auth_headers(org_token)
    )
    assert res.status_code == 200
    assert res.json()["prerequisite_lesson_id"] == prereq_id

    await create_user(db_session, "volQ@example.com", UserRole.volunteer)
    vol_token = await login(client, "volQ@example.com")

    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    assert res.status_code == 403

    await client.post(f"/api/v1/lessons/{prereq_id}/complete", json={"answers": []}, headers=auth_headers(vol_token))
    res = await client.post(f"/api/v1/events/{event_id}/register", headers=auth_headers(vol_token))
    assert res.status_code == 201
