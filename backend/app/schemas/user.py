from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.models.user import AgeVerificationMethod, OrganizationLegalType, OrganizationStatus, UserRole


class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str
    display_name: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not (3 <= len(v) <= 100):
            raise ValueError("Логин должен быть от 3 до 100 символов")
        return v


class OrganizerRegister(UserRegister):
    org_name: str
    inn: str


class VerificationSentOut(BaseModel):
    status: str = "verification_sent"
    email: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str


class ResendCodeRequest(BaseModel):
    email: EmailStr


class UserLogin(BaseModel):
    username: str
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    inn: str
    legal_type: OrganizationLegalType
    points_total: float
    bio: str | None
    status: OrganizationStatus
    rejection_reason: str | None


class OrganizationTicketOut(OrganizationOut):
    contact_email: str
    created_at: datetime


class OrganizationBioUpdate(BaseModel):
    bio: str | None = None


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str
    avatar_url: str | None
    bio: str | None
    points_total: float
    role: UserRole
    team_id: int | None
    region: str | None
    current_streak: int
    longest_streak: int
    selected_avatar_frame: str | None


class UserMe(UserPublic):
    username: str
    email: str
    pending_email: str | None
    email_verified: bool
    age_verified: bool
    age_verification_method: AgeVerificationMethod
    dobro_ru_linked: bool
    dvizhenie_pervyh_linked: bool
    organization: OrganizationOut | None


class UserUpdate(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    team_id: int | None = None
    region: str | None = None


class UsernameChangeRequest(BaseModel):
    current_password: str
    new_username: str

    @field_validator("new_username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not (3 <= len(v) <= 100):
            raise ValueError("Логин должен быть от 3 до 100 символов")
        return v


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Пароль должен быть не короче 6 символов")
        return v


class EmailChangeRequest(BaseModel):
    current_password: str
    new_email: EmailStr


class EmailChangeConfirmRequest(BaseModel):
    code: str


class ManualVerificationRequest(BaseModel):
    full_name: str
    birth_date: date
    passport_series: str
    passport_number: str
    issued_by: str
    issued_date: date


class AvatarFrameRequest(BaseModel):
    frame_code: str | None


class LeaderboardEntry(BaseModel):
    id: int
    name: str
    points_total: float
    city: str | None = None
    region: str | None = None
