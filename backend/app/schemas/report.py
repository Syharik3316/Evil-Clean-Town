from datetime import datetime

from pydantic import BaseModel, ConfigDict, model_validator

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
    created_at: datetime


class ModerationRequest(BaseModel):
    approve: bool
    comment: str | None = None

    @model_validator(mode="after")
    def require_comment_on_reject(self) -> "ModerationRequest":
        if not self.approve and not self.comment:
            raise ValueError("Укажите причину отклонения")
        return self
