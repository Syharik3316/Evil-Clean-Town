import logging
from email.message import EmailMessage
from pathlib import Path

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)

# Палитра и радиусы — из дизайн-системы Broadsheet фронтенда (frontend/css/style.css:
# --color-accent-900/--color-accent-700/--color-accent-100/--color-bg/--color-neutral-700,
# --radius-sm/--radius-md), чтобы письмо выглядело частью того же продукта, что и сайт.
HEADER_BG = "#0a303e"  # --color-accent-900, цвет шапки сайта (.topbar)
PRIMARY_DARK = "#006786"  # --color-accent-700
CODE_BG = "#e9f8ff"  # --color-accent-100
TEXT = "#201e1d"  # --color-text
TEXT_MUTED = "#605d5d"  # --color-neutral-700
BG = "#f3f2f2"  # --color-bg
SURFACE = "#ffffff"
BORDER = "#dcdad9"  # приближение --color-divider для непрозрачного email-фона
FONT_STACK = "'Source Serif 4', Georgia, 'Times New Roman', serif"  # --font-body/--font-heading

LOGO_PATH = Path(__file__).resolve().parent.parent / "static" / "email-logo.png"
LOGO_CID = "goodwill-logo"


def _logo_html() -> str:
    # Логотип всегда встраивается в письмо как inline-вложение (Content-ID) в _send(),
    # поэтому не зависит от PUBLIC_BASE_URL/доступности сайта — почтовый клиент показывает
    # картинку сразу, без подгрузки внешнего изображения.
    return f'<img src="cid:{LOGO_CID}" alt="GoodWill" height="40" style="display:block;height:40px;width:auto" />'


def _wrap_email_html(preheader: str, title: str, body_html: str) -> str:
    """Оборачивает содержимое письма в брендированный HTML-каркас (стили инлайновые —
    так требуют почтовые клиенты, внешние stylesheet'ы они не подгружают)."""
    contact_url = f"{settings.public_base_url}" if settings.public_base_url else "#"
    return f"""<!doctype html>
<html lang="ru">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:{BG};font-family:{FONT_STACK};color:{TEXT}">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0">{preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG};padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:{SURFACE};border-radius:2px;overflow:hidden;border:1px solid {BORDER}">
        <tr><td style="padding:22px 32px;background:{HEADER_BG}">{_logo_html()}</td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 16px;font-size:21px;font-weight:600;letter-spacing:-.015em;color:{TEXT};font-family:{FONT_STACK}">{title}</h1>
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

    if LOGO_PATH.exists():
        html_part = message.get_body(preferencelist=("html",))
        if html_part is not None:
            html_part.add_related(LOGO_PATH.read_bytes(), maintype="image", subtype="png", cid=f"<{LOGO_CID}>")

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
      <div style="margin:0 0 20px;padding:18px 0;text-align:center;background:{CODE_BG};border-radius:1px">
        <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:{PRIMARY_DARK};font-family:{FONT_STACK}">{code}</span>
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


async def send_password_reset_code(to_email: str, code: str) -> None:
    ttl = settings.email_verification_code_ttl_minutes
    text_body = (
        "Код для сброса пароля: "
        f"{code}\n\nКод действителен {ttl} минут. "
        "Если вы не запрашивали смену пароля на GoodWill — просто проигнорируйте это письмо, "
        "пароль останется прежним."
    )
    body_html = f"""
      <p style="margin:0 0 20px;font-size:14px;color:{TEXT_MUTED};line-height:1.5">
        Кто-то (надеемся, вы) запросил сброс пароля на GoodWill. Введите этот код на сайте,
        чтобы задать новый пароль:
      </p>
      <div style="margin:0 0 20px;padding:18px 0;text-align:center;background:{CODE_BG};border-radius:1px">
        <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:{PRIMARY_DARK};font-family:{FONT_STACK}">{code}</span>
      </div>
      <p style="margin:0;font-size:13px;color:{TEXT_MUTED};line-height:1.5">
        Код действителен {ttl} минут. Если вы не запрашивали смену пароля — просто
        проигнорируйте это письмо, пароль останется прежним.
      </p>
    """
    html_body = _wrap_email_html(
        preheader=f"Код для сброса пароля: {code}",
        title="Восстановление пароля",
        body_html=body_html,
    )
    await _send(to_email, "Восстановление пароля — GoodWill", text_body, html_body)
