"""Заготовка интеграции с Госуслугами (ЕСИА) для верификации возраста.

Реального обмена данными с ЕСИА пока нет — это точка расширения на будущее.
Пока `settings.gosuslugi_client_id` не задан, эндпоинт-обёртка в `app/api/v1/users.py`
возвращает понятную ошибку "интеграция в разработке", не пытаясь обратиться к ЕСИА.
"""

from urllib.parse import urlencode

from app.core.config import settings


def is_configured() -> bool:
    return bool(settings.gosuslugi_client_id and settings.gosuslugi_redirect_uri)


def build_authorize_url(state: str) -> str:
    """Строит authorize-URL в формате ЕСИА OAuth2. Не используется, пока is_configured() == False."""
    params = {
        "client_id": settings.gosuslugi_client_id,
        "redirect_uri": settings.gosuslugi_redirect_uri,
        "response_type": "code",
        "scope": "openid fullname birthdate",
        "state": state,
    }
    return f"{settings.gosuslugi_authorize_url}?{urlencode(params)}"


async def exchange_code_for_age_verification(code: str) -> dict:
    """Обмен кода авторизации на данные о возрасте пользователя.

    Не реализовано — реальная интеграция с ЕСИА выходит за рамки текущего этапа.
    """
    raise NotImplementedError("Обмен кода ЕСИА на данные пользователя пока не реализован")
