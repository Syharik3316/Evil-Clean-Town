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

    await create_user(db_session, "mod@example.com", UserRole.organizer)
    mod_token = await login(client, "mod@example.com")

    res = await client.post(
        f"/api/v1/reports/{report['id']}/moderate", json={"approve": True}, headers=auth_headers(mod_token)
    )
    assert res.status_code == 200
    assert res.json()["status"] == "approved"

    me = await client.get("/api/v1/users/me", headers=auth_headers(reporter_token))
    assert me.json()["points_total"] == report.get("points_reward", 15)


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

    await create_user(db_session, "mod2@example.com", UserRole.organizer)
    mod_token = await login(client, "mod2@example.com")

    res = await client.post(
        f"/api/v1/reports/{report_id}/moderate", json={"approve": False}, headers=auth_headers(mod_token)
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"

    me = await client.get("/api/v1/users/me", headers=auth_headers(reporter_token))
    assert me.json()["points_total"] == 0


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
