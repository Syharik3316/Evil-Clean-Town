from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_admin
from app.models.event import Event, EventRegistration, RegistrationStatus
from app.models.lesson import UserLessonProgress
from app.models.report import ReportStatus, TrashReport
from app.models.user import Team, User
from app.schemas.user import LeaderboardEntry

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
async def stats(db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    async def count(stmt):
        result = await db.execute(stmt)
        return result.scalar_one()

    users_total = await count(select(func.count()).select_from(User))
    teams_total = await count(select(func.count()).select_from(Team))
    events_total = await count(select(func.count()).select_from(Event))
    checkins_total = await count(
        select(func.count()).select_from(EventRegistration).where(
            EventRegistration.status == RegistrationStatus.checked_in
        )
    )
    lessons_completed_total = await count(select(func.count()).select_from(UserLessonProgress))
    reports_total = await count(select(func.count()).select_from(TrashReport))
    reports_pending = await count(
        select(func.count()).select_from(TrashReport).where(TrashReport.status == ReportStatus.pending)
    )
    reports_approved = await count(
        select(func.count()).select_from(TrashReport).where(TrashReport.status == ReportStatus.approved)
    )
    points_awarded = await count(select(func.coalesce(func.sum(User.points_total), 0)))

    by_city_result = await db.execute(
        select(Team.city, func.sum(Team.points_total))
        .where(Team.city.is_not(None))
        .group_by(Team.city)
        .order_by(func.sum(Team.points_total).desc())
    )

    return {
        "users_total": users_total,
        "teams_total": teams_total,
        "events_total": events_total,
        "checkins_total": checkins_total,
        "lessons_completed_total": lessons_completed_total,
        "reports_total": reports_total,
        "reports_pending": reports_pending,
        "reports_approved": reports_approved,
        "points_awarded_total": points_awarded,
        "points_by_city": [{"city": city, "points": points} for city, points in by_city_result.all()],
    }


@router.get("/teams", response_model=list[LeaderboardEntry])
async def list_teams(db: AsyncSession = Depends(get_db), _admin=Depends(require_admin)):
    result = await db.execute(select(Team).order_by(Team.points_total.desc()))
    return [
        LeaderboardEntry(id=t.id, name=t.name, points_total=t.points_total, city=t.city)
        for t in result.scalars().all()
    ]


@router.post("/teams", status_code=201)
async def create_team(
    name: str, type: str = "club", city: str | None = None,
    db: AsyncSession = Depends(get_db), _admin=Depends(require_admin),
):
    team = Team(name=name, type=type, city=city)
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return {"id": team.id}
