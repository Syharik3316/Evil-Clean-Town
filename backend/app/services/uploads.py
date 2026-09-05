"""Общая логика приёма загружаемых изображений (аватары, ачивки, рамки) — валидация
типа/размера и сохранение в uploads/<subdir>/ под случайным именем."""
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


async def save_upload_image(photo: UploadFile, subdir: str) -> str:
    if photo.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Допустимы только изображения JPEG/PNG/WebP")

    contents = await photo.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Файл слишком большой")

    upload_dir = Path(settings.upload_dir) / subdir
    upload_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(photo.filename or "").suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    (upload_dir / filename).write_bytes(contents)
    return f"/uploads/{subdir}/{filename}"
