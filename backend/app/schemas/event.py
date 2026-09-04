from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.event import EventStatus, EventType, RegistrationStatus


class EventRoleCreate(BaseModel):
    title: str
    description: str | None = None
    capacity: int | None = None


class EventRoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    capacity: int | None


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
    region: str | None
    lat: float
    lon: float
    capacity: int | None
    points_reward: int
    applications_closed_at: datetime | None
    prerequisite_lesson_id: int | None
    roles: list[EventRoleOut] = []


class EventCreate(BaseModel):
    title: str
    description: str
    event_type: EventType = EventType.cleanup
    site_id: int | None = None
    starts_at: datetime
    ends_at: datetime | None = None
    address: str | None = None
    region: str | None = None
    lat: float
    lon: float
    capacity: int | None = None
    points_reward: int = 20
    roles: list[EventRoleCreate] = []


class EventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: EventStatus | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    address: str | None = None
    region: str | None = None
    capacity: int | None = None


class RegisterForEventRequest(BaseModel):
    role_id: int | None = None


class EventRegistrationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    user_id: int
    role_id: int | None
    status: RegistrationStatus
    rejection_reason: str | None
    is_featured: bool
    special_note: str | None
    registered_at: datetime
    checkin_at: datetime | None


class ApplicantVolunteerInfo(BaseModel):
    id: int
    display_name: str
    avatar_url: str | None
    points_total: float
    events_attended: int
    achievements_count: int


class ApplicantOut(EventRegistrationOut):
    volunteer: ApplicantVolunteerInfo


class ApplicantDecisionRequest(BaseModel):
    status: RegistrationStatus
    reason: str | None = None


class BonusPointsRequest(BaseModel):
    amount: float
    reason: str


class FeatureApplicantRequest(BaseModel):
    is_featured: bool
    special_note: str | None = None


class CheckinRequest(BaseModel):
    lat: float
    lon: float
