import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import utcnow


class AchievementCriteria(str, enum.Enum):
    lessons_completed = "lessons_completed"
    events_attended = "events_attended"
    reports_approved = "reports_approved"
    points_threshold = "points_threshold"
    seasonal_events_attended = "seasonal_events_attended"
    # ачивки для организаторов — считаются по мероприятиям/курсам, которые создал сам организатор
    events_created = "events_created"
    events_completed = "events_completed"
    event_volunteers_registered = "event_volunteers_registered"
    courses_created = "courses_created"
    course_completions = "course_completions"


class AchievementAudience(str, enum.Enum):
    volunteer = "volunteer"
    organizer = "organizer"


class Achievement(Base):
    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    icon: Mapped[str] = mapped_column(String(10), default="🏅", nullable=False)
    # кастомное изображение значка ачивки (загружается админом), приоритетнее icon при наличии
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # кому адресована ачивка: волонтёру или организатору (см. AchievementCriteria выше)
    audience: Mapped[AchievementAudience] = mapped_column(
        Enum(AchievementAudience), default=AchievementAudience.volunteer, nullable=False
    )
    criteria_type: Mapped[AchievementCriteria] = mapped_column(Enum(AchievementCriteria), nullable=False)
    criteria_value: Mapped[int] = mapped_column(Integer, nullable=False)
    points_reward: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # для seasonal_events_attended: "winter" | "spring" | "summer" | "autumn"
    season: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # код рамки аватара, которую открывает эта ачивка (см. frame-* классы в css/style.css)
    avatar_frame_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # кастомное изображение рамки аватара (загружается админом), приоритетнее avatar_frame_code при наличии
    avatar_frame_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    achievement_id: Mapped[int] = mapped_column(ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False)
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    achievement: Mapped[Achievement] = relationship()


class PointsLedger(Base):
    __tablename__ = "points_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[str] = mapped_column(String(200), nullable=False)
    related_entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    related_entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
