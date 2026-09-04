from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import EventRegistration, RegistrationStatus
from app.models.gamification import Achievement, AchievementCriteria, PointsLedger, UserAchievement
from app.models.lesson import UserLessonProgress
from app.models.report import ReportStatus, TrashReport
from app.models.user import User

MAX_ACHIEVEMENT_PASSES = 5


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


async def _criteria_progress(db: AsyncSession, user: User, criteria_type: AchievementCriteria) -> float:
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
            progress = await _criteria_progress(db, user, achievement.criteria_type)
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
