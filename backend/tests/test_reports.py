import io

import pytest

from app.models.user import UserRole
from tests.helpers import auth_headers, create_user, login

pytestmark = pytest.mark.asyncio


def _fake_photo():
    return io.BytesIO(b"\x89PNG\r\n\x1a\nfake-png-bytes")


async def test_submit_report_and_moderate_approve_awards_points(client, db_session):
    await create_user(db_session, "reporter@example.com", UserRole.volunteer)
    reporter_token = await login(client, "reporter@example.com")

    res = await client.post(
        "/api/v1/reports",
        data={"lat": "44.9", "lon": "37.3", "description": "Мусор у волнореза"},
        files={"photo": ("photo.png", _fake_photo(), "image/png")},
        headers=auth_headers(reporter_token),
    )
    assert res.status_code == 201, res.text
    report = res.json()
    assert report["status"] == "pending"

    await create_user(db_session, "mod@example.com", UserRole.admin)
    mod_token = await login(client, "mod@example.com")

    res = await client.post(
        f"/api/v1/reports/{report['id']}/moderate", json={"approve": True}, headers=auth_headers(mod_token)
    )
    assert res.status_code == 200
    assert res.json()["status"] == "approved"

    me = await client.get("/api/v1/users/me", headers=auth_headers(reporter_token))
    assert me.json()["points_total"] == report.get("points_reward", 15)


async def test_admin_can_override_points_on_approve(client, db_session):
    await create_user(db_session, "reporter5@example.com", UserRole.volunteer)
    reporter_token = await login(client, "reporter5@example.com")
    res = await client.post(
        "/api/v1/reports",
        data={"lat": "1", "lon": "1"},
        files={"photo": ("photo.png", _fake_photo(), "image/png")},
        headers=auth_headers(reporter_token),
    )
    report_id = res.json()["id"]

    await create_user(db_session, "mod5@example.com", UserRole.admin)
    mod_token = await login(client, "mod5@example.com")

    res = await client.post(
        f"/api/v1/reports/{report_id}/moderate", json={"approve": True, "points": 42}, headers=auth_headers(mod_token)
    )
    assert res.status_code == 200
    assert res.json()["points_reward"] == 42

    me = await client.get("/api/v1/users/me", headers=auth_headers(reporter_token))
    assert me.json()["points_total"] == 42


async def test_organizer_can_no_longer_moderate_reports(client, db_session):
    await create_user(db_session, "reporter6@example.com", UserRole.volunteer)
    reporter_token = await login(client, "reporter6@example.com")
    res = await client.post(
        "/api/v1/reports",
        data={"lat": "1", "lon": "1"},
        files={"photo": ("photo.png", _fake_photo(), "image/png")},
        headers=auth_headers(reporter_token),
    )
    report_id = res.json()["id"]

    await create_user(db_session, "org-mod@example.com", UserRole.organizer)
    org_token = await login(client, "org-mod@example.com")

    res = await client.post(
        f"/api/v1/reports/{report_id}/moderate", json={"approve": True}, headers=auth_headers(org_token)
    )
    assert res.status_code == 403


async def test_reject_report_awards_no_points(client, db_session):
    await create_user(db_session, "reporter2@example.com", UserRole.volunteer)
    reporter_token = await login(client, "reporter2@example.com")

    res = await client.post(
        "/api/v1/reports",
        data={"lat": "1", "lon": "1"},
        files={"photo": ("photo.png", _fake_photo(), "image/png")},
        headers=auth_headers(reporter_token),
    )
    report_id = res.json()["id"]

    await create_user(db_session, "mod2@example.com", UserRole.admin)
    mod_token = await login(client, "mod2@example.com")

    res = await client.post(
        f"/api/v1/reports/{report_id}/moderate",
        json={"approve": False, "comment": "Фото нечёткое, мусор не виден"},
        headers=auth_headers(mod_token),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"

    me = await client.get("/api/v1/users/me", headers=auth_headers(reporter_token))
    assert me.json()["points_total"] == 0


async def test_reject_without_comment_rejected(client, db_session):
    await create_user(db_session, "reporter2b@example.com", UserRole.volunteer)
    reporter_token = await login(client, "reporter2b@example.com")

    res = await client.post(
        "/api/v1/reports",
        data={"lat": "1", "lon": "1"},
        files={"photo": ("photo.png", _fake_photo(), "image/png")},
        headers=auth_headers(reporter_token),
    )
    report_id = res.json()["id"]

    await create_user(db_session, "mod2b@example.com", UserRole.admin)
    mod_token = await login(client, "mod2b@example.com")

    res = await client.post(
        f"/api/v1/reports/{report_id}/moderate", json={"approve": False}, headers=auth_headers(mod_token)
    )
    assert res.status_code == 422


async def test_volunteer_cannot_moderate(client, db_session):
    await create_user(db_session, "reporter3@example.com", UserRole.volunteer)
    token = await login(client, "reporter3@example.com")
    res = await client.post(
        "/api/v1/reports",
        data={"lat": "1", "lon": "1"},
        files={"photo": ("photo.png", _fake_photo(), "image/png")},
        headers=auth_headers(token),
    )
    report_id = res.json()["id"]

    res = await client.post(
        f"/api/v1/reports/{report_id}/moderate", json={"approve": True}, headers=auth_headers(token)
    )
    assert res.status_code == 403


async def test_organizer_cannot_submit_report(client, db_session):
    await create_user(db_session, "org-reporter@example.com", UserRole.organizer)
    token = await login(client, "org-reporter@example.com")
    res = await client.post(
        "/api/v1/reports",
        data={"lat": "1", "lon": "1"},
        files={"photo": ("photo.png", _fake_photo(), "image/png")},
        headers=auth_headers(token),
    )
    assert res.status_code == 403


async def test_admin_cannot_submit_report(client, db_session):
    await create_user(db_session, "admin-reporter@example.com", UserRole.admin)
    token = await login(client, "admin-reporter@example.com")
    res = await client.post(
        "/api/v1/reports",
        data={"lat": "1", "lon": "1"},
        files={"photo": ("photo.png", _fake_photo(), "image/png")},
        headers=auth_headers(token),
    )
    assert res.status_code == 403


async def test_invalid_content_type_rejected(client, db_session):
    await create_user(db_session, "reporter4@example.com", UserRole.volunteer)
    token = await login(client, "reporter4@example.com")
    res = await client.post(
        "/api/v1/reports",
        data={"lat": "1", "lon": "1"},
        files={"photo": ("photo.txt", io.BytesIO(b"not an image"), "text/plain")},
        headers=auth_headers(token),
    )
    assert res.status_code == 400
