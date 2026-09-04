from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.report import ReportStatus


class TrashReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    site_id: int | None
    photo_url: str
    description: str | None
    lat: float
    lon: float
    status: ReportStatus
    created_at: datetime


class ModerationRequest(BaseModel):
    approve: bool
    comment: str | None = None
