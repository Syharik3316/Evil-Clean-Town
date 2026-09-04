import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, utcnow


class EventType(str, enum.Enum):
    cleanup = "cleanup"
    webinar = "webinar"
    quest = "quest"


class EventStatus(str, enum.Enum):
    draft = "draft"
    pending_review = "pending_review"
    published = "published"
    rejected = "rejected"
    cancelled = "cancelled"


class RegistrationStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    checked_in = "checked_in"
    cancelled = "cancelled"


class Event(TimestampMixin, Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    event_type: Mapped[EventType] = mapped_column(Enum(EventType), default=EventType.cleanup, nullable=False)
    status: Mapped[EventStatus] = mapped_column(Enum(EventStatus), default=EventStatus.published, nullable=False)

    site_id: Mapped[int | None] = mapped_column(ForeignKey("coastline_sites.id"), nullable=True)
    organizer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    region: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    points_reward: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    applications_closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    prerequisite_lesson_id: Mapped[int | None] = mapped_column(ForeignKey("lessons.id"), nullable=True)

    registrations: Mapped[list["EventRegistration"]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )
    roles: Mapped[list["EventRole"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", lazy="selectin"
    )


class EventRole(Base):
    __tablename__ = "event_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    event: Mapped[Event] = relationship(back_populates="roles")


class EventRegistration(Base):
    __tablename__ = "event_registrations"
    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_event_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role_id: Mapped[int | None] = mapped_column(ForeignKey("event_roles.id"), nullable=True)
    status: Mapped[RegistrationStatus] = mapped_column(
        Enum(RegistrationStatus), default=RegistrationStatus.pending, nullable=False
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    special_note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    checkin_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checkin_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    checkin_lon: Mapped[float | None] = mapped_column(Float, nullable=True)

    event: Mapped[Event] = relationship(back_populates="registrations")
