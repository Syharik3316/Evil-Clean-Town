from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.user import Team, User
from app.schemas.user import LeaderboardEntry, UserMe, UserPublic, UserUpdate

router = APIRouter(tags=["users"])


@router.get("/users/me", response_model=UserMe)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.patch("/users/me", response_model=UserMe)
async def update_me(
    payload: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = payload.model_dump(exclude_unset=True)
    if "team_id" in data and data["team_id"] is not None:
        team = await db.get(Team, data["team_id"])
        if team is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Команда не найдена")
    for field, value in data.items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/users/{user_id}", response_model=UserPublic)
async def get_user_public(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return user


@router.get("/teams", response_model=list[LeaderboardEntry])
async def list_teams(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Team).order_by(Team.name))
    return [
        LeaderboardEntry(id=t.id, name=t.name, points_total=t.points_total, city=t.city)
        for t in result.scalars().all()
    ]


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(
    scope: str = Query("users", pattern="^(users|teams)$"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    if scope == "teams":
        stmt = select(Team).order_by(Team.points_total.desc()).limit(limit)
        result = await db.execute(stmt)
        return [
            LeaderboardEntry(id=t.id, name=t.name, points_total=t.points_total, city=t.city)
            for t in result.scalars().all()
        ]

    stmt = select(User).order_by(User.points_total.desc()).limit(limit)
    result = await db.execute(stmt)
    return [
        LeaderboardEntry(id=u.id, name=u.display_name, points_total=u.points_total)
        for u in result.scalars().all()
    ]
