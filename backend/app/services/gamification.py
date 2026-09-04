from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event, EventRegistration, RegistrationStatus
from app.models.gamification import Achievement, AchievementCriteria, PointsLedger, UserAchievement
from app.models.lesson import Lesson, UserLessonProgress
from app.models.mixins import ensure_aware, utcnow
from app.models.report import ReportStatus, TrashReport
from app.models.user import Organization, User

MAX_ACHIEVEMENT_PASSES = 5

SEASON_MONTHS = {
    "winter": (12, 1, 2),
    "spring": (3, 4, 5),
    "summer": (6, 7, 8),
    "autumn": (9, 10, 11),
}


async def _credit_organization(db: AsyncSession, amount: float, related_entity_type: str | None, related_entity_id: int | None) -> None:
    """Организация получает те же баллы, что и волонтёр, если баллы начислены за
    её мероприятие или её курс — усиливает рейтинг организаций (раздел 6)."""
    organizer_user_id = None
    if related_entity_type == "event" and related_entity_id is not None:
        event = await db.get(Event, related_entity_id)
        if event is not None:
            organizer_user_id = event.organizer_id
    elif related_entity_type == "lesson" and related_entity_id is not None:
        lesson = await db.get(Lesson, related_entity_id)
        if lesson is not None:
            organizer_user_id = lesson.created_by_id

    if organizer_user_id is None:
        return
    organizer_user = await db.get(User, organizer_user_id)
    if organizer_user is None or organizer_user.organization_id is None:
        return
    organization = await db.get(Organization, organizer_user.organization_id)
    if organization is not None:
        organization.points_total += amount


async def award_points(
    db: AsyncSession,
    user: User,
    amount: float,
    reason: str,
    related_entity_type: str | None = None,
    related_entity_id: int | None = None,
) -> None:
    if amount == 0:
        return

    user.points_total += amount
    db.add(
        PointsLedger(
            user_id=user.id,
            amount=amount,
            reason=reason,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
        )
    )
    if user.team_id is not None:
        from app.models.user import Team

        team = await db.get(Team, user.team_id)
        if team is not None:
            team.points_total += amount

    await _credit_organization(db, amount, related_entity_type, related_entity_id)


async def update_streak(db: AsyncSession, user: User) -> None:
    """Пересчитывает «огоньки» — число подряд идущих месяцев минимум с одним
    гео-чекином на мероприятии. Вызывается после успешного чекина."""
    result = await db.execute(
        select(EventRegistration.checkin_at).where(
            EventRegistration.user_id == user.id,
            EventRegistration.status == RegistrationStatus.checked_in,
            EventRegistration.checkin_at.is_not(None),
        )
    )
    checkins = [ensure_aware(c) for c in result.scalars().all()]
    months = sorted({(c.year, c.month) for c in checkins})
    if not months:
        user.current_streak = 0
        return

    streak = 1
    best = 1
    for (y0, m0), (y1, m1) in zip(months, months[1:]):
        if (y1 - y0) * 12 + (m1 - m0) == 1:
            streak += 1
        else:
            streak = 1
        best = max(best, streak)

    now = utcnow()
    last_y, last_m = months[-1]
    months_since_active = (now.year - last_y) * 12 + (now.month - last_m)
    user.current_streak = streak if months_since_active <= 1 else 0
    user.longest_streak = max(user.longest_streak, best)


async def _criteria_progress(db: AsyncSession, user: User, achievement: Achievement) -> float:
    criteria_type = achievement.criteria_type
    if criteria_type == AchievementCriteria.points_threshold:
        return user.points_total

    if criteria_type == AchievementCriteria.lessons_completed:
        stmt = select(func.count()).select_from(UserLessonProgress).where(UserLessonProgress.user_id == user.id)
    elif criteria_type == AchievementCriteria.events_attended:
        stmt = (
            select(func.count())
            .select_from(EventRegistration)
            .where(
                EventRegistration.user_id == user.id,
                EventRegistration.status == RegistrationStatus.checked_in,
            )
        )
    elif criteria_type == AchievementCriteria.reports_approved:
        stmt = (
            select(func.count())
            .select_from(TrashReport)
            .where(TrashReport.user_id == user.id, TrashReport.status == ReportStatus.approved)
        )
    elif criteria_type == AchievementCriteria.seasonal_events_attended:
        months = SEASON_MONTHS.get(achievement.season or "", ())
        if not months:
            return 0
        stmt = (
            select(func.count())
            .select_from(EventRegistration)
            .where(
                EventRegistration.user_id == user.id,
                EventRegistration.status == RegistrationStatus.checked_in,
                extract("month", EventRegistration.checkin_at).in_(months),
            )
        )
    else:
        return 0

    result = await db.execute(stmt)
    return result.scalar_one()


async def check_achievements(db: AsyncSession, user: User) -> list[str]:
    """Grants any newly-earned achievements. Returns titles of newly granted achievements."""
    newly_granted: list[str] = []

    for _ in range(MAX_ACHIEVEMENT_PASSES):
        earned_ids_result = await db.execute(
            select(UserAchievement.achievement_id).where(UserAchievement.user_id == user.id)
        )
        earned_ids = set(earned_ids_result.scalars().all())

        all_achievements_result = await db.execute(select(Achievement))
        candidates = [a for a in all_achievements_result.scalars().all() if a.id not in earned_ids]
        if not candidates:
            break

        granted_this_pass = False
        for achievement in candidates:
            progress = await _criteria_progress(db, user, achievement)
            if progress >= achievement.criteria_value:
                db.add(UserAchievement(user_id=user.id, achievement_id=achievement.id))
                newly_granted.append(achievement.title)
                granted_this_pass = True
                if achievement.points_reward:
                    await award_points(
                        db,
                        user,
                        achievement.points_reward,
                        reason=f"Ачивка: {achievement.title}",
                        related_entity_type="achievement",
                        related_entity_id=achievement.id,
                    )

        if not granted_this_pass:
            break

    return newly_granted
