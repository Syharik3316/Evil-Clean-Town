import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_verification_code(to_email: str, code: str) -> None:
    if not settings.smtp_host:
        logger.warning("SMTP не настроен (smtp_host пуст в .env) — код для %s: %s", to_email, code)
        return

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to_email
    message["Subject"] = "Код подтверждения — Чистый берег"
    message.set_content(
        "Ваш код подтверждения регистрации: "
        f"{code}\n\nКод действителен {settings.email_verification_code_ttl_minutes} минут. "
        "Если вы не регистрировались на «Чистом береге» — просто проигнорируйте это письмо."
    )

    await aiosmtplib.send(
        message,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        start_tls=settings.smtp_use_tls,
    )
