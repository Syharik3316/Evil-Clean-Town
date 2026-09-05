import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)

PRIMARY = "#0f8b6c"
PRIMARY_DARK = "#0b6b53"
TEXT = "#16241f"
TEXT_MUTED = "#5c6b66"
BG = "#f4f8f7"
SURFACE = "#ffffff"
BORDER = "#dbe6e2"


def _logo_html() -> str:
    if not settings.public_base_url:
        return f'<div style="font-size:22px;font-weight:700;color:{PRIMARY_DARK}">GoodWill</div>'
    return f'<img src="{settings.public_base_url}/logo.png" alt="GoodWill" height="36" style="display:block;height:36px;width:auto" />'


def _wrap_email_html(preheader: str, title: str, body_html: str) -> str:
    """Оборачивает содержимое письма в брендированный HTML-каркас (стили инлайновые —
    так требуют почтовые клиенты, внешние stylesheet'ы они не подгружают)."""
    contact_url = f"{settings.public_base_url}" if settings.public_base_url else "#"
    return f"""<!doctype html>
<html lang="ru">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:{BG};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:{TEXT}">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0">{preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG};padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:{SURFACE};border-radius:12px;overflow:hidden;border:1px solid {BORDER}">
        <tr><td style="padding:24px 32px;border-bottom:1px solid {BORDER}">{_logo_html()}</td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 16px;font-size:20px;color:{TEXT}">{title}</h1>
          {body_html}
        </td></tr>
        <tr><td style="padding:20px 32px;background:{BG};border-top:1px solid {BORDER}">
          <p style="margin:0 0 6px;font-size:12px;color:{TEXT_MUTED}">© 2026 GoodWill. Все права защищены.</p>
          <p style="margin:0;font-size:12px;color:{TEXT_MUTED}">
            <a href="mailto:admin@syharik.ru" style="color:{PRIMARY_DARK}">admin@syharik.ru</a>
            &nbsp;·&nbsp;
            <a href="{contact_url}" style="color:{PRIMARY_DARK}">{settings.public_base_url or "goodwill"}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def _send(to_email: str, subject: str, text_body: str, html_body: str) -> None:
    if not settings.smtp_host:
        logger.warning("SMTP не настроен (smtp_host пуст в .env) — письмо для %s не отправлено:\n%s", to_email, text_body)
        return

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    await aiosmtplib.send(
        message,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        start_tls=settings.smtp_use_tls,
    )


async def send_verification_code(to_email: str, code: str) -> None:
    ttl = settings.email_verification_code_ttl_minutes
    text_body = (
        "Ваш код подтверждения: "
        f"{code}\n\nКод действителен {ttl} минут. "
        "Если вы не запрашивали этот код на GoodWill — просто проигнорируйте это письмо."
    )
    body_html = f"""
      <p style="margin:0 0 20px;font-size:14px;color:{TEXT_MUTED};line-height:1.5">
        Используйте этот код, чтобы подтвердить свою почту на GoodWill:
      </p>
      <div style="margin:0 0 20px;padding:18px 0;text-align:center;background:{BG};border-radius:8px">
        <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:{PRIMARY_DARK}">{code}</span>
      </div>
      <p style="margin:0;font-size:13px;color:{TEXT_MUTED};line-height:1.5">
        Код действителен {ttl} минут. Если вы не запрашивали этот код — просто проигнорируйте это письмо.
      </p>
    """
    html_body = _wrap_email_html(
        preheader=f"Ваш код подтверждения: {code}",
        title="Подтверждение почты",
        body_html=body_html,
    )
    await _send(to_email, "Код подтверждения — GoodWill", text_body, html_body)
