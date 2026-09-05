import base64

import pytest

from app.models.user import UserRole
from tests.helpers import auth_headers, create_user, login

# валидный 1x1 PNG — тот же, что используется во фронтенд-проверках upload-эндпоинтов
PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)

pytestmark = pytest.mark.asyncio


async def test_non_admin_cannot_create_site(client, db_session):
    await create_user(db_session, "volsite@example.com")
    token = await login(client, "volsite@example.com")

    res = await client.post(
        "/api/v1/sites",
        json={"name": "Чужой участок", "lat": 45.0, "lon": 37.5},
        headers=auth_headers(token),
    )
    assert res.status_code == 403


async def test_admin_site_and_layer_crud(client, db_session):
    await create_user(db_session, "sitesadmin@example.com", UserRole.admin)
    token = await login(client, "sitesadmin@example.com")
    headers = auth_headers(token)

    res = await client.post(
        "/api/v1/sites",
        json={"name": "Тестовый участок", "region": "Тестовый регион", "lat": 45.0, "lon": 37.5},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    site_id = res.json()["id"]

    res = await client.patch(
        f"/api/v1/sites/{site_id}", json={"name": "Переименованный участок"}, headers=headers
    )
    assert res.status_code == 200
    assert res.json()["name"] == "Переименованный участок"

    # загрузка снимка (см. конструктор /admin-sites) — возвращает image_url для слоя
    res = await client.post(
        "/api/v1/sites/upload-image",
        files={"photo": ("test.png", PNG_1PX, "image/png")},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    image_url = res.json()["image_url"]
    assert image_url.startswith("/uploads/satellite/")

    res = await client.post(
        f"/api/v1/sites/{site_id}/layers",
        json={
            "captured_at": "2026-01-01",
            "layer_type": "rgb",
            "label": "До уборки",
            "image_url": image_url,
            "bounds": [[44.99, 37.49], [45.01, 37.51]],
            "order_index": 0,
        },
        headers=headers,
    )
    assert res.status_code == 201, res.text
    layer_id = res.json()["id"]

    res = await client.patch(
        f"/api/v1/sites/{site_id}/layers/{layer_id}",
        json={"label": "После уборки", "order_index": 1},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["label"] == "После уборки"
    assert res.json()["image_url"] == image_url  # не тронут, раз не передали заново

    res = await client.get(f"/api/v1/sites/{site_id}")
    assert len(res.json()["layers"]) == 1

    res = await client.delete(f"/api/v1/sites/{site_id}/layers/{layer_id}", headers=headers)
    assert res.status_code == 204

    res = await client.get(f"/api/v1/sites/{site_id}")
    assert res.json()["layers"] == []

    res = await client.delete(f"/api/v1/sites/{site_id}", headers=headers)
    assert res.status_code == 204

    res = await client.get(f"/api/v1/sites/{site_id}")
    assert res.status_code == 404
