from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.report import ReportStatus


class TrashReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    site_id: int | None
    event_id: int | None
    photo_url: str
    description: str | None
    region: str | None
    lat: float
    lon: float
    status: ReportStatus
    points_reward: int
    created_at: datetime


class ModerationRequest(BaseModel):
    approve: bool
    comment: str | None = None
    # баллы за принятый репорт — на усмотрение админа при одобрении; если не указано,
    # используется points_reward, заданный при создании репорта (значение по умолчанию)
    points: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def require_comment_on_reject(self) -> "ModerationRequest":
        if not self.approve and not self.comment:
            raise ValueError("Укажите причину отклонения")
        return self
