import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin


class UserRole(str, enum.Enum):
    volunteer = "volunteer"
    organizer = "organizer"
    admin = "admin"


class AgeVerificationMethod(str, enum.Enum):
    none = "none"
    gosuslugi = "gosuslugi"
    manual = "manual"


class OrganizationLegalType(str, enum.Enum):
    legal_entity = "legal_entity"
    individual_entrepreneur = "individual_entrepreneur"


class TeamType(str, enum.Enum):
    school = "school"
    club = "club"
    city = "city"
    university = "university"
    college = "college"


class Team(TimestampMixin, Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[TeamType] = mapped_column(Enum(TeamType), default=TeamType.club, nullable=False)
    city: Mapped[str | None] = mapped_column(String(200), nullable=True)
    points_total: Mapped[float] = mapped_column(Float, default=0, nullable=False)

    members: Mapped[list["User"]] = relationship(back_populates="team")


class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    inn: Mapped[str] = mapped_column(String(12), unique=True, index=True, nullable=False)
    legal_type: Mapped[OrganizationLegalType] = mapped_column(Enum(OrganizationLegalType), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)
    points_total: Mapped[float] = mapped_column(Float, default=0, nullable=False)

    members: Mapped[list["User"]] = relationship(back_populates="organization")


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.volunteer, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    points_total: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    region: Mapped[str | None] = mapped_column(String(200), nullable=True)

    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    age_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    age_verification_method: Mapped[AgeVerificationMethod] = mapped_column(
        Enum(AgeVerificationMethod), default=AgeVerificationMethod.none, nullable=False
    )
    dobro_ru_linked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dvizhenie_pervyh_linked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    current_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    selected_avatar_frame: Mapped[str | None] = mapped_column(String(100), nullable=True)

    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    team: Mapped[Team | None] = relationship(back_populates="members")

    organization_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    organization: Mapped[Organization | None] = relationship(back_populates="members", lazy="selectin")
