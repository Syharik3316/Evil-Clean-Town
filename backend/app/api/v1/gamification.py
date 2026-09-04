from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, get_db
from app.models.gamification import Achievement, PointsLedger, UserAchievement
from app.models.user import User
from app.schemas.gamification import AchievementOut, PointsLedgerEntry, UserAchievementOut

router = APIRouter(tags=["gamification"])


@router.get("/achievements", response_model=list[AchievementOut])
async def list_achievements(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Achievement))
    return result.scalars().all()


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
