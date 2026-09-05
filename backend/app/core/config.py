from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "GoodWill API"
    environment: str = "development"
    database_url: str = "sqlite+aiosqlite:///./local.db"

    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 10
    checkin_radius_meters: float = 500.0

    cors_origins: list[str] = ["*"]

    # Публичный адрес сайта (со схемой, без слэша в конце) — используется для абсолютных
    # ссылок на статику (логотип) в HTML-письмах. Если пусто, письма отправляются без логотипа.
    public_base_url: str = ""

    # Автосоздание единственного администратора при старте (см. app/db/seed_admin.py).
    # Если любое из полей пусто — бутстрап пропускается (не трогает существующих админов).
    admin_username: str = ""
    admin_email: str = ""
    admin_password: str = ""

    # SMTP (отправка кода подтверждения email). Если smtp_host пуст — письма не отправляются,
    # код только логируется (для локальной разработки/тестов без реального почтового сервера).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "no-reply@goodwill.ru"
    smtp_use_tls: bool = True
    email_verification_code_ttl_minutes: int = 15

    # Госуслуги (ЕСИА) — заготовка подключения, без реального использования.
    # Пока client_id пуст, эндпоинт возвращает 501 "интеграция в разработке".
    gosuslugi_client_id: str = ""
    gosuslugi_client_secret: str = ""
    gosuslugi_redirect_uri: str = ""
    gosuslugi_authorize_url: str = "https://esia.gosuslugi.ru/aas/oauth2/ac"

    min_age_years: int = 14

    # Web Push (десктопные/браузерные уведомления вне вкладки — Notification API + Service
    # Worker). Публичный ключ отдаётся фронтенду для подписки (frontend/js/push.js),
    # приватным подписываются сообщения на push-сервис браузера (pywebpush). Если пусто —
    # push просто не отправляется, в БД по-прежнему пишется обычное уведомление.
    # Сгенерировать пару: python scripts/generate_vapid_keys.py
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@syharik.ru"

    # Firebase Cloud Messaging (пуши в мобильное приложение Capacitor/Android — в отличие
    # от Web Push, доставляются, даже когда приложение полностью закрыто/убито системой).
    # Значение — содержимое service account JSON целиком, одной строкой (Firebase Console →
    # Настройки проекта → Служебные аккаунты → Создать закрытый ключ). Если пусто — FCM
    # push просто не отправляется, в БД по-прежнему пишется обычное уведомление.
    firebase_credentials_json: str = ""

    # Read-only Postgres-роль для Grafana (см. docker-compose.yml, grafana/provisioning).
    grafana_db_password: str = "change-me"


settings = Settings()
