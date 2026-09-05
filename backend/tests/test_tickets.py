from datetime import datetime, timedelta, timezone

import pytest

from app.models.site import CoastlineSite
from app.models.user import Organization, OrganizationLegalType, OrganizationStatus, UserRole
from tests.helpers import auth_headers, create_user, login

pytestmark = pytest.mark.asyncio

EVENT_LAT, EVENT_LON = 44.8951, 37.3168


async def _create_site(db_session) -> int:
    site = CoastlineSite(name="Тикет-пляж", region="Тикет-регион", lat=EVENT_LAT, lon=EVENT_LON)
    db_session.add(site)
    await db_session.commit()
    await db_session.refresh(site)
    return site.id


async def _propose_event(client, org_token, site_id, **overrides) -> int:
    payload = {
        "title": "Уборка на модерации",
        "description": "Ждём одобрения админа",
        "event_type": "cleanup",
        "site_id": site_id,
        "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "lat": EVENT_LAT,
        "lon": EVENT_LON,
    }
    payload.update(overrides)
    res = await client.post("/api/v1/events", json=payload, headers=auth_headers(org_token))
    assert res.status_code == 201, res.text
    return res.json()["id"]


async def test_admin_sees_pending_event_ticket_and_approves(client, db_session):
    await create_user(db_session, "orgA@example.com", UserRole.organizer)
    org_token = await login(client, "orgA@example.com")
    await create_user(db_session, "adminA@example.com", UserRole.admin)
    admin_token = await login(client, "adminA@example.com")

    site_id = await _create_site(db_session)
    event_id = await _propose_event(client, org_token, site_id)

    res = await client.get("/api/v1/admin/tickets/events", headers=auth_headers(admin_token))
    assert res.status_code == 200
    ids = [e["id"] for e in res.json()]
    assert event_id in ids

    # not visible publicly yet
    res = await client.get("/api/v1/events")
    assert res.json() == []

    res = await client.post(f"/api/v1/admin/tickets/events/{event_id}/approve", headers=auth_headers(admin_token))
    assert res.status_code == 200
    assert res.json()["status"] == "published"

    res = await client.get("/api/v1/events")
    assert len(res.json()) == 1

    # notification delivered to the organizer
    res = await client.get("/api/v1/notifications", headers=auth_headers(org_token))
    types = [n["type"] for n in res.json()]
    assert "event_approved" in types


async def test_organizer_cannot_access_ticket_queue(client, db_session):
    await create_user(db_session, "orgB@example.com", UserRole.organizer)
    org_token = await login(client, "orgB@example.com")
    res = await client.get("/api/v1/admin/tickets/events", headers=auth_headers(org_token))
    assert res.status_code == 403


async def test_reject_event_ticket_requires_reason_and_notifies(client, db_session):
    await create_user(db_session, "orgC@example.com", UserRole.organizer)
    org_token = await login(client, "orgC@example.com")
    await create_user(db_session, "adminC@example.com", UserRole.admin)
    admin_token = await login(client, "adminC@example.com")

    site_id = await _create_site(db_session)
    event_id = await _propose_event(client, org_token, site_id)

    res = await client.post(f"/api/v1/admin/tickets/events/{event_id}/reject", json={}, headers=auth_headers(admin_token))
    assert res.status_code == 422

    res = await client.post(
        f"/api/v1/admin/tickets/events/{event_id}/reject",
        json={"reason": "Не хватает деталей о месте сбора"},
        headers=auth_headers(admin_token),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"

    res = await client.get("/api/v1/notifications", headers=auth_headers(org_token))
    rejected = [n for n in res.json() if n["type"] == "event_rejected"]
    assert len(rejected) == 1
    assert rejected[0]["body"] == "Не хватает деталей о месте сбора"


async def test_edit_and_approve_event_ticket(client, db_session):
    await create_user(db_session, "orgD@example.com", UserRole.organizer)
    org_token = await login(client, "orgD@example.com")
    await create_user(db_session, "adminD@example.com", UserRole.admin)
    admin_token = await login(client, "adminD@example.com")

    site_id = await _create_site(db_session)
    event_id = await _propose_event(client, org_token, site_id, title="Черновое название")

    res = await client.post(
        f"/api/v1/admin/tickets/events/{event_id}/edit-approve",
        json={"title": "Отредактированное название"},
        headers=auth_headers(admin_token),
    )
    assert res.status_code == 200, res.text
    assert res.json()["title"] == "Отредактированное название"
    assert res.json()["status"] == "published"


async def test_admin_full_event_history(client, db_session):
    await create_user(db_session, "orgE@example.com", UserRole.organizer)
    org_token = await login(client, "orgE@example.com")
    await create_user(db_session, "adminE@example.com", UserRole.admin)
    admin_token = await login(client, "adminE@example.com")

    site_id = await _create_site(db_session)
    await _propose_event(client, org_token, site_id)

    res = await client.get("/api/v1/admin/events", headers=auth_headers(admin_token))
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["status"] == "pending_review"


async def _org_organizer(db_session, email: str, status: OrganizationStatus = OrganizationStatus.pending):
    org = Organization(
        name="Тикет-организация", inn="7707083893", legal_type=OrganizationLegalType.legal_entity,
        contact_email=email, status=status,
    )
    db_session.add(org)
    await db_session.flush()
    user = await create_user(db_session, email, UserRole.organizer)
    user.organization_id = org.id
    await db_session.commit()
    await db_session.refresh(org)
    return user, org


async def test_unapproved_organization_cannot_create_event(client, db_session):
    await _org_organizer(db_session, "pendingorg@example.com")
    org_token = await login(client, "pendingorg@example.com")
    site_id = await _create_site(db_session)

    res = await client.post(
        "/api/v1/events",
        json={
            "title": "Мероприятие непроверенной организации", "description": "x", "event_type": "cleanup",
            "site_id": site_id, "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "lat": EVENT_LAT, "lon": EVENT_LON,
        },
        headers=auth_headers(org_token),
    )
    assert res.status_code == 403


async def test_admin_approves_organization_and_unblocks_event_creation(client, db_session):
    _, org = await _org_organizer(db_session, "approveorg@example.com")
    org_token = await login(client, "approveorg@example.com")
    await create_user(db_session, "adminF@example.com", UserRole.admin)
    admin_token = await login(client, "adminF@example.com")
    site_id = await _create_site(db_session)

    res = await client.get("/api/v1/admin/tickets/organizations", headers=auth_headers(admin_token))
    assert res.status_code == 200
    assert org.id in [o["id"] for o in res.json()]

    res = await client.post(
        f"/api/v1/admin/tickets/organizations/{org.id}/approve", headers=auth_headers(admin_token)
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "approved"

    res = await client.get("/api/v1/notifications", headers=auth_headers(org_token))
    assert "organization_approved" in [n["type"] for n in res.json()]

    event_id = await _propose_event(client, org_token, site_id)
    assert event_id is not None


async def test_admin_rejects_organization_with_reason(client, db_session):
    _, org = await _org_organizer(db_session, "rejectorg@example.com")
    await create_user(db_session, "adminG@example.com", UserRole.admin)
    admin_token = await login(client, "adminG@example.com")
    org_token = await login(client, "rejectorg@example.com")

    res = await client.post(
        f"/api/v1/admin/tickets/organizations/{org.id}/reject", json={}, headers=auth_headers(admin_token)
    )
    assert res.status_code == 422

    res = await client.post(
        f"/api/v1/admin/tickets/organizations/{org.id}/reject",
        json={"reason": "ИНН не подтверждён"},
        headers=auth_headers(admin_token),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"

    res = await client.get("/api/v1/notifications", headers=auth_headers(org_token))
    rejected = [n for n in res.json() if n["type"] == "organization_rejected"]
    assert len(rejected) == 1
    assert rejected[0]["body"] == "ИНН не подтверждён"
