from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, get_db, require_admin
from app.models.gamification import Achievement, PointsLedger, UserAchievement
from app.models.user import User
from app.schemas.gamification import (
    AchievementCreate,
    AchievementOut,
    AchievementUpdate,
    PointsLedgerEntry,
    UserAchievementOut,
)
from app.services.uploads import save_upload_image

router = APIRouter(tags=["gamification"])


@router.get("/achievements", response_model=list[AchievementOut])
async def list_achievements(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Achievement))
    return result.scalars().all()


async def _get_achievement_or_404(db: AsyncSession, achievement_id: int) -> Achievement:
    achievement = await db.get(Achievement, achievement_id)
    if achievement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ачивка не найдена")
    return achievement


@router.post("/admin/achievements", response_model=AchievementOut, status_code=status.HTTP_201_CREATED)
async def create_achievement(
    payload: AchievementCreate, _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    existing = await db.execute(select(Achievement).where(Achievement.code == payload.code))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ачивка с таким кодом уже существует")

    achievement = Achievement(**payload.model_dump())
    db.add(achievement)
    await db.commit()
    await db.refresh(achievement)
    return achievement


@router.patch("/admin/achievements/{achievement_id}", response_model=AchievementOut)
async def update_achievement(
    achievement_id: int,
    payload: AchievementUpdate,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    achievement = await _get_achievement_or_404(db, achievement_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(achievement, field, value)
    await db.commit()
    await db.refresh(achievement)
    return achievement


@router.delete("/admin/achievements/{achievement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_achievement(
    achievement_id: int, _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    achievement = await _get_achievement_or_404(db, achievement_id)
    await db.delete(achievement)
    await db.commit()


@router.post("/admin/achievements/{achievement_id}/image", response_model=AchievementOut)
async def upload_achievement_image(
    achievement_id: int,
    photo: UploadFile = File(...),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    achievement = await _get_achievement_or_404(db, achievement_id)
    achievement.image_url = await save_upload_image(photo, "achievements")
    await db.commit()
    await db.refresh(achievement)
    return achievement


@router.post("/admin/achievements/{achievement_id}/frame-image", response_model=AchievementOut)
async def upload_achievement_frame_image(
    achievement_id: int,
    photo: UploadFile = File(...),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    achievement = await _get_achievement_or_404(db, achievement_id)
    achievement.avatar_frame_image_url = await save_upload_image(photo, "frames")
    await db.commit()
    await db.refresh(achievement)
    return achievement


@router.get("/users/me/achievements", response_model=list[UserAchievementOut])
async def my_achievements(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserAchievement)
        .where(UserAchievement.user_id == user.id)
        .options(selectinload(UserAchievement.achievement))
        .order_by(UserAchievement.earned_at.desc())
    )
    return result.scalars().all()


@router.get("/users/me/points", response_model=list[PointsLedgerEntry])
async def my_points(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PointsLedger).where(PointsLedger.user_id == user.id).order_by(PointsLedger.created_at.desc())
    )
    return result.scalars().all()
