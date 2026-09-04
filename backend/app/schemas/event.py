from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.event import EventStatus, EventType, RegistrationStatus


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    event_type: EventType
    status: EventStatus
    site_id: int | None
    organizer_id: int
    starts_at: datetime
    ends_at: datetime | None
    address: str | None
    lat: float
    lon: float
    capacity: int | None
    points_reward: int


class EventCreate(BaseModel):
    title: str
    description: str
    event_type: EventType = EventType.cleanup
    site_id: int | None = None
    starts_at: datetime
    ends_at: datetime | None = None
    address: str | None = None
    lat: float
    lon: float
    capacity: int | None = None
    points_reward: int = 20


class EventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: EventStatus | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    address: str | None = None
    capacity: int | None = None


class EventRegistrationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    user_id: int
    status: RegistrationStatus
    registered_at: datetime
    checkin_at: datetime | None


class CheckinRequest(BaseModel):
    lat: float
    lon: float
