from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.session import get_db
from app.models import Base

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)


@pytest_asyncio.fixture(autouse=True)
async def prepare_database():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _override_get_db():
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture(scope="session", autouse=True)
def _configure_upload_dir(tmp_path_factory):
    from app.core.config import settings

    settings.upload_dir = str(tmp_path_factory.mktemp("uploads"))
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)


sent_verification_codes: dict[str, str] = {}


async def _capture_send_verification_code(to_email: str, code: str) -> None:
    sent_verification_codes[to_email] = code


@pytest_asyncio.fixture(autouse=True)
def _patch_email_sending(monkeypatch):
    sent_verification_codes.clear()
    import app.services.verification as verification_module

    monkeypatch.setattr(verification_module, "send_verification_code", _capture_send_verification_code)
    # тот же перехват для писем сброса пароля (см. auth.py /forgot-password) — иначе
    # тесты попытаются реально отправить письмо через настоящий SMTP из .env
    monkeypatch.setattr(verification_module, "send_password_reset_code", _capture_send_verification_code)


@pytest_asyncio.fixture
async def client():
    from app.main import app

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def db_session():
    async with TestSessionLocal() as session:
        yield session
