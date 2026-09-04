import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import settings

logger = logging.getLogger("app.startup")

app = FastAPI(title=settings.app_name)

if settings.environment == "production":
    if settings.cors_origins == ["*"]:
        logger.warning(
            "ENVIRONMENT=production, но CORS_ORIGINS=[\"*\"] — укажите конкретные домены фронтенда в .env"
        )
    if settings.jwt_secret_key == "change-me-in-production":
        logger.warning("ENVIRONMENT=production, но JWT_SECRET_KEY не изменён с дефолтного значения")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
