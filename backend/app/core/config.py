from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Чистый берег API"
    database_url: str = "sqlite+aiosqlite:///./local.db"

    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 10
    checkin_radius_meters: float = 500.0

    cors_origins: list[str] = ["*"]

    seed_on_startup: bool = False


settings = Settings()
