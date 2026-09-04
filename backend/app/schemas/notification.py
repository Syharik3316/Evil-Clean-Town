from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    title: str
    body: str | None
    related_entity_type: str | None
    related_entity_id: int | None
    read_at: datetime | None
    created_at: datetime
