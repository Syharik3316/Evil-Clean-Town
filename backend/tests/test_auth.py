import pytest

pytestmark = pytest.mark.asyncio


async def test_register_and_login(client):
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": "a@example.com", "password": "password123", "display_name": "Аня"},
    )
    assert res.status_code == 201
    tokens = res.json()
    assert "access_token" in tokens and "refresh_token" in tokens

    res = await client.post(
        "/api/v1/auth/login", json={"email": "a@example.com", "password": "password123"}
    )
    assert res.status_code == 200

    res = await client.post(
        "/api/v1/auth/login", json={"email": "a@example.com", "password": "wrong"}
    )
    assert res.status_code == 401


async def test_duplicate_registration_rejected(client):
    payload = {"email": "dup@example.com", "password": "password123", "display_name": "Дубль"}
    res1 = await client.post("/api/v1/auth/register", json=payload)
    assert res1.status_code == 201
    res2 = await client.post("/api/v1/auth/register", json=payload)
    assert res2.status_code == 409


async def test_refresh_token_flow(client):
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": "refresh@example.com", "password": "password123", "display_name": "Р"},
    )
    refresh_token = res.json()["refresh_token"]

    res = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert res.status_code == 200
    assert "access_token" in res.json()


async def test_me_requires_auth(client):
    res = await client.get("/api/v1/users/me")
    assert res.status_code == 401

    reg = await client.post(
        "/api/v1/auth/register",
        json={"email": "me@example.com", "password": "password123", "display_name": "Я"},
    )
    access = reg.json()["access_token"]
    res = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {access}"})
    assert res.status_code == 200
    assert res.json()["email"] == "me@example.com"
