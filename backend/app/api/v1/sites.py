from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db, require_admin
from app.models.site import CoastlineSite, SatelliteLayer
from app.schemas.site import (
    CoastlineSiteCreate,
    CoastlineSiteDetail,
    CoastlineSiteOut,
    CoastlineSiteUpdate,
    SatelliteLayerCreate,
    SatelliteLayerOut,
    SatelliteLayerUpdate,
)
from app.services.uploads import save_upload_image

router = APIRouter(prefix="/sites", tags=["sites"])


@router.get("", response_model=list[CoastlineSiteOut])
async def list_sites(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CoastlineSite).order_by(CoastlineSite.name))
    return result.scalars().all()


@router.post("/upload-image")
async def upload_site_image(
    photo: UploadFile = File(...),
    _admin=Depends(require_admin),
):
    """Загружает снимок ДЗЗ в общий volume uploads и возвращает его URL — использовать
    в поле image_url при создании/редактировании слоя (см. конструктор /admin-sites)."""
    return {"image_url": await save_upload_image(photo, "satellite")}


@router.get("/{site_id}", response_model=CoastlineSiteDetail)
async def get_site(site_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CoastlineSite).where(CoastlineSite.id == site_id).options(selectinload(CoastlineSite.layers))
    )
    site = result.scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Участок берега не найден")
    return site


@router.get("/{site_id}/layers", response_model=list[SatelliteLayerOut])
async def get_site_layers(site_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SatelliteLayer).where(SatelliteLayer.site_id == site_id).order_by(SatelliteLayer.order_index)
    )
    return result.scalars().all()


@router.post("", response_model=CoastlineSiteOut, status_code=status.HTTP_201_CREATED)
async def create_site(
    payload: CoastlineSiteCreate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    site = CoastlineSite(**payload.model_dump())
    db.add(site)
    await db.commit()
    await db.refresh(site)
    return site


@router.post("/{site_id}/layers", response_model=SatelliteLayerOut, status_code=status.HTTP_201_CREATED)
async def create_layer(
    site_id: int,
    payload: SatelliteLayerCreate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    site = await db.get(CoastlineSite, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Участок берега не найден")
    layer = SatelliteLayer(site_id=site_id, **payload.model_dump())
    db.add(layer)
    await db.commit()
    await db.refresh(layer)
    return layer


@router.patch("/{site_id}", response_model=CoastlineSiteOut)
async def update_site(
    site_id: int,
    payload: CoastlineSiteUpdate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    site = await db.get(CoastlineSite, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Участок берега не найден")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(site, field, value)
    await db.commit()
    await db.refresh(site)
    return site


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_site(
    site_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    site = await db.get(CoastlineSite, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Участок берега не найден")
    await db.delete(site)
    await db.commit()


@router.patch("/{site_id}/layers/{layer_id}", response_model=SatelliteLayerOut)
async def update_layer(
    site_id: int,
    layer_id: int,
    payload: SatelliteLayerUpdate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    layer = await db.get(SatelliteLayer, layer_id)
    if layer is None or layer.site_id != site_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Слой не найден")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(layer, field, value)
    await db.commit()
    await db.refresh(layer)
    return layer


@router.delete("/{site_id}/layers/{layer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_layer(
    site_id: int,
    layer_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    layer = await db.get(SatelliteLayer, layer_id)
    if layer is None or layer.site_id != site_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Слой не найден")
    await db.delete(layer)
    await db.commit()
