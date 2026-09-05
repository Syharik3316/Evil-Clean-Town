from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.gamification import AchievementAudience, AchievementCriteria


class AchievementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    title: str
    description: str
    icon: str
    image_url: str | None
    audience: AchievementAudience
    criteria_type: AchievementCriteria
    criteria_value: int
    points_reward: int
    season: str | None
    avatar_frame_code: str | None
    avatar_frame_image_url: str | None


class AchievementCreate(BaseModel):
    code: str
    title: str
    description: str
    icon: str = "🏅"
    audience: AchievementAudience = AchievementAudience.volunteer
    criteria_type: AchievementCriteria
    criteria_value: int
    points_reward: int = 0
    season: str | None = None
    avatar_frame_code: str | None = None


class AchievementUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    icon: str | None = None
    audience: AchievementAudience | None = None
    criteria_type: AchievementCriteria | None = None
    criteria_value: int | None = None
    points_reward: int | None = None
    season: str | None = None
    avatar_frame_code: str | None = None


class UserAchievementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    earned_at: datetime
    achievement: AchievementOut


class PointsLedgerEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    amount: float
    reason: str
    created_at: datetime
