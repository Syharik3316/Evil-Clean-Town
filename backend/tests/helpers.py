from app.core.security import hash_password
from app.models.user import AgeVerificationMethod, User, UserRole
from tests.conftest import sent_verification_codes


async def register_and_verify(
    client, *, username: str, email: str, password: str = "password123", display_name: str = "Тест"
) -> dict:
    res = await client.post(
        "/api/v1/auth/register",
        json={"username": username, "email": email, "password": password, "display_name": display_name},
    )
    assert res.status_code == 201, res.text
    code = sent_verification_codes[email]
    res = await client.post("/api/v1/auth/verify-email", json={"email": email, "code": code})
    assert res.status_code == 200, res.text
    return res.json()


async def create_user(
    db_session,
    email: str,
    role: UserRole = UserRole.volunteer,
    password: str = "password123",
    age_verified: bool = True,
) -> User:
    username = email.split("@")[0]
    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        display_name=username,
        role=role,
        email_verified=True,
        age_verified=age_verified,
        age_verification_method=AgeVerificationMethod.manual if age_verified else AgeVerificationMethod.none,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def login(client, email: str, password: str = "password123") -> str:
    username = email.split("@")[0]
    res = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
