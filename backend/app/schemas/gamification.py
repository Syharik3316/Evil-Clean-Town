from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.gamification import AchievementCriteria


class AchievementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    title: str
    description: str
    icon: str
    criteria_type: AchievementCriteria
    criteria_value: int
    points_reward: int


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
