from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.user import UserRole


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    display_name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str
    avatar_url: str | None
    points_total: float
    role: UserRole
    team_id: int | None


class UserMe(UserPublic):
    email: str


class UserUpdate(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None
    team_id: int | None = None


class LeaderboardEntry(BaseModel):
    id: int
    name: str
    points_total: float
    city: str | None = None
