from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.deps import get_current_user, get_db
from app.models.event import Event
from app.models.gamification import Achievement, UserAchievement
from app.models.user import AgeVerificationMethod, Organization, Team, User
from app.models.verification import ManualVerificationSubmission
from app.schemas.user import (
    AvatarFrameRequest,
    LeaderboardEntry,
    ManualVerificationRequest,
    UserMe,
    UserPublic,
    UserUpdate,
)
from app.services import gosuslugi

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


@router.post("/users/me/age-verification/manual", response_model=UserMe)
async def verify_age_manual(
    payload: ManualVerificationRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Заглушка ручной верификации: отправка любых данных сразу подтверждает возраст пользователя."""
    db.add(ManualVerificationSubmission(user_id=user.id, **payload.model_dump()))
    user.age_verified = True
    user.age_verification_method = AgeVerificationMethod.manual
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/users/me/age-verification/gosuslugi/start")
async def verify_age_gosuslugi_start(user: User = Depends(get_current_user)):
    if not gosuslugi.is_configured():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Интеграция с Госуслугами находится в разработке. Используйте ручную верификацию.",
        )
    return {"redirect_url": gosuslugi.build_authorize_url(state=str(user.id))}


@router.post("/users/me/link/dobro-ru", response_model=UserMe)
async def link_dobro_ru(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user.dobro_ru_linked = True
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/users/me/link/dvizhenie-pervyh", response_model=UserMe)
async def link_dvizhenie_pervyh(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user.dvizhenie_pervyh_linked = True
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/users/me/avatar-frames")
async def list_unlocked_frames(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Achievement.avatar_frame_code)
        .join(UserAchievement, UserAchievement.achievement_id == Achievement.id)
        .where(UserAchievement.user_id == user.id, Achievement.avatar_frame_code.is_not(None))
    )
    return {"frames": sorted(set(result.scalars().all()))}


@router.post("/users/me/avatar-frame", response_model=UserMe)
async def set_avatar_frame(
    payload: AvatarFrameRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    if payload.frame_code is not None:
        result = await db.execute(
            select(Achievement.id)
            .join(UserAchievement, UserAchievement.achievement_id == Achievement.id)
            .where(UserAchievement.user_id == user.id, Achievement.avatar_frame_code == payload.frame_code)
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Эта рамка ещё не разблокирована")

    user.selected_avatar_frame = payload.frame_code
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
    scope: str = Query("users", pattern="^(users|teams|organizations)$"),
    region: str | None = Query(None),
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

    if scope == "organizations":
        stmt = select(Organization)
        if region:
            organizer = aliased(User)
            stmt = stmt.where(
                Organization.id.in_(
                    select(organizer.organization_id)
                    .join(Event, Event.organizer_id == organizer.id)
                    .where(Event.region == region, organizer.organization_id.is_not(None))
                )
            )
        stmt = stmt.order_by(Organization.points_total.desc()).limit(limit)
        result = await db.execute(stmt)
        return [
            LeaderboardEntry(id=o.id, name=o.name, points_total=o.points_total)
            for o in result.scalars().all()
        ]

    stmt = select(User)
    if region:
        stmt = stmt.where(User.region == region)
    stmt = stmt.order_by(User.points_total.desc()).limit(limit)
    result = await db.execute(stmt)
    return [
        LeaderboardEntry(id=u.id, name=u.display_name, points_total=u.points_total, region=u.region)
        for u in result.scalars().all()
    ]
