from app.core.security import hash_password
from app.models.user import User, UserRole


async def create_user(db_session, email: str, role: UserRole = UserRole.volunteer, password: str = "password123") -> User:
    user = User(email=email, password_hash=hash_password(password), display_name=email.split("@")[0], role=role)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def login(client, email: str, password: str = "password123") -> str:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
