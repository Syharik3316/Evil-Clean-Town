import enum

from sqlalchemy import Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin


class UserRole(str, enum.Enum):
    volunteer = "volunteer"
    organizer = "organizer"
    admin = "admin"


class TeamType(str, enum.Enum):
    school = "school"
    club = "club"
    city = "city"


class Team(TimestampMixin, Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[TeamType] = mapped_column(Enum(TeamType), default=TeamType.club, nullable=False)
    city: Mapped[str | None] = mapped_column(String(200), nullable=True)
    points_total: Mapped[float] = mapped_column(Float, default=0, nullable=False)

    members: Mapped[list["User"]] = relationship(back_populates="team")


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.volunteer, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    points_total: Mapped[float] = mapped_column(Float, default=0, nullable=False)

    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    team: Mapped[Team | None] = relationship(back_populates="members")
