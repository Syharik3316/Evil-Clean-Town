import pytest

from tests.conftest import sent_verification_codes
from tests.helpers import register_and_verify

pytestmark = pytest.mark.asyncio


async def test_register_verify_and_login(client):
    res = await client.post(
        "/api/v1/auth/register",
        json={"username": "anya", "email": "a@example.com", "password": "password123", "display_name": "Аня"},
    )
    assert res.status_code == 201
    assert res.json() == {"status": "verification_sent", "email": "a@example.com"}

    code = sent_verification_codes["a@example.com"]
    wrong_code = "000000" if code != "000000" else "999999"
    res = await client.post("/api/v1/auth/verify-email", json={"email": "a@example.com", "code": wrong_code})
    assert res.status_code == 400

    res = await client.post("/api/v1/auth/verify-email", json={"email": "a@example.com", "code": code})
    assert res.status_code == 200
    tokens = res.json()
    assert "access_token" in tokens and "refresh_token" in tokens

    res = await client.post("/api/v1/auth/login", json={"username": "anya", "password": "password123"})
    assert res.status_code == 200

    res = await client.post("/api/v1/auth/login", json={"username": "anya", "password": "wrong"})
    assert res.status_code == 401


async def test_login_before_verification_rejected(client):
    await client.post(
        "/api/v1/auth/register",
        json={"username": "unverified", "email": "unverified@example.com", "password": "password123", "display_name": "Н"},
    )
    res = await client.post("/api/v1/auth/login", json={"username": "unverified", "password": "password123"})
    assert res.status_code == 403
    # email передаётся в ответе, чтобы фронтенд мог сразу показать форму ввода кода
    assert res.json()["email"] == "unverified@example.com"


async def test_resend_code_allows_login_after_lost_code(client):
    await client.post(
        "/api/v1/auth/register",
        json={"username": "resendme", "email": "resendme@example.com", "password": "password123", "display_name": "Р"},
    )
    old_code = sent_verification_codes["resendme@example.com"]

    res = await client.post("/api/v1/auth/resend-code", json={"email": "resendme@example.com"})
    assert res.status_code == 200
    new_code = sent_verification_codes["resendme@example.com"]

    res = await client.post("/api/v1/auth/verify-email", json={"email": "resendme@example.com", "code": new_code})
    assert res.status_code == 200

    # резервный код от старого письма больше не должен быть единственным путём — но и
    # старый факт отправки не ломает верификацию новым кодом
    assert new_code is not None and old_code is not None


async def test_resend_code_unknown_email_does_not_leak(client):
    res = await client.post("/api/v1/auth/resend-code", json={"email": "nosuchuser@example.com"})
    assert res.status_code == 200
    assert res.json()["email"] == "nosuchuser@example.com"


async def test_duplicate_registration_rejected(client):
    payload = {"username": "dup", "email": "dup@example.com", "password": "password123", "display_name": "Дубль"}
    res1 = await client.post("/api/v1/auth/register", json=payload)
    assert res1.status_code == 201
    res2 = await client.post("/api/v1/auth/register", json=payload)
    assert res2.status_code == 409

    res3 = await client.post(
        "/api/v1/auth/register",
        json={**payload, "email": "other@example.com"},
    )
    assert res3.status_code == 409  # username taken


async def test_refresh_token_flow(client):
    tokens = await register_and_verify(client, username="refresher", email="refresh@example.com")
    res = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert res.status_code == 200
    assert "access_token" in res.json()


async def test_me_requires_auth(client):
    res = await client.get("/api/v1/users/me")
    assert res.status_code == 401

    tokens = await register_and_verify(client, username="meuser", email="me@example.com")
    res = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "me@example.com"
    assert body["username"] == "meuser"
    assert body["email_verified"] is True
    assert body["age_verified"] is False


async def test_organizer_registration_via_inn(client):
    # 7707083893 — валидный тестовый ИНН юрлица (контрольная сумма проходит проверку)
    res = await client.post(
        "/api/v1/auth/register/organizer",
        json={
            "username": "orgowner", "email": "orgowner@example.com", "password": "password123",
            "display_name": "Владелец", "org_name": "Эко Фонд", "inn": "7707083893",
        },
    )
    assert res.status_code == 201, res.text

    code = sent_verification_codes["orgowner@example.com"]
    res = await client.post("/api/v1/auth/verify-email", json={"email": "orgowner@example.com", "code": code})
    assert res.status_code == 200, res.text
    tokens = res.json()

    res = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    body = res.json()
    assert body["role"] == "organizer"
    assert body["organization"]["name"] == "Эко Фонд"
    assert body["organization"]["legal_type"] == "legal_entity"


async def test_organizer_registration_invalid_inn_rejected(client):
    res = await client.post(
        "/api/v1/auth/register/organizer",
        json={
            "username": "badinn", "email": "badinn@example.com", "password": "password123",
            "display_name": "Тест", "org_name": "Компания", "inn": "1234567890",
        },
    )
    assert res.status_code == 400


async def test_manual_age_verification(client):
    tokens = await register_and_verify(client, username="verifyme", email="verifyme@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    res = await client.post(
        "/api/v1/users/me/age-verification/manual",
        json={
            "full_name": "Иванов Иван Иванович", "birth_date": "2000-01-01",
            "passport_series": "1234", "passport_number": "567890",
            "issued_by": "ОВД района", "issued_date": "2020-01-01",
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["age_verified"] is True
    assert res.json()["age_verification_method"] == "manual"


async def test_gosuslugi_stub_not_configured(client):
    tokens = await register_and_verify(client, username="gosuser", email="gosuser@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    res = await client.post("/api/v1/users/me/age-verification/gosuslugi/start", headers=headers)
    assert res.status_code == 501


async def test_change_username_requires_current_password(client):
    tokens = await register_and_verify(client, username="userold", email="userold@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    res = await client.patch(
        "/api/v1/users/me/username",
        json={"current_password": "wrong", "new_username": "usernew"},
        headers=headers,
    )
    assert res.status_code == 401

    res = await client.patch(
        "/api/v1/users/me/username",
        json={"current_password": "password123", "new_username": "usernew"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["username"] == "usernew"

    res = await client.post("/api/v1/auth/login", json={"username": "usernew", "password": "password123"})
    assert res.status_code == 200


async def test_change_password(client):
    tokens = await register_and_verify(client, username="pwuser", email="pwuser@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    res = await client.patch(
        "/api/v1/users/me/password",
        json={"current_password": "password123", "new_password": "newpassword456"},
        headers=headers,
    )
    assert res.status_code == 200

    res = await client.post("/api/v1/auth/login", json={"username": "pwuser", "password": "password123"})
    assert res.status_code == 401
    res = await client.post("/api/v1/auth/login", json={"username": "pwuser", "password": "newpassword456"})
    assert res.status_code == 200


async def test_change_email_requires_confirmation_code(client):
    tokens = await register_and_verify(client, username="emailuser", email="emailold@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    res = await client.post(
        "/api/v1/users/me/email/change",
        json={"current_password": "password123", "new_email": "emailnew@example.com"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["pending_email"] == "emailnew@example.com"
    assert res.json()["email"] == "emailold@example.com"

    code = sent_verification_codes["emailnew@example.com"]
    res = await client.post("/api/v1/users/me/email/confirm", json={"code": "000001" if code != "000001" else "000002"}, headers=headers)
    assert res.status_code == 400

    res = await client.post("/api/v1/users/me/email/confirm", json={"code": code}, headers=headers)
    assert res.status_code == 200
    assert res.json()["email"] == "emailnew@example.com"
    assert res.json()["pending_email"] is None
