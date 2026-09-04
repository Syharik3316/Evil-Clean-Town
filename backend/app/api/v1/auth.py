from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.core.security import create_token, decode_token, hash_password, verify_password
from app.models.mixins import utcnow
from app.models.user import Organization, User, UserRole
from app.models.verification import LoginEvent
from app.schemas.user import (
    OrganizerRegister,
    RefreshRequest,
    TokenPair,
    UserLogin,
    UserMe,
    UserRegister,
    VerificationSentOut,
    VerifyEmailRequest,
)
from app.services.inn import validate_inn
from app.services.verification import consume_email_verification_code, issue_email_verification_code

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_pair(user_id: int) -> TokenPair:
    return TokenPair(
        access_token=create_token(str(user_id), "access"),
        refresh_token=create_token(str(user_id), "refresh"),
    )


async def _reject_if_taken(db: AsyncSession, username: str, email: str) -> None:
    existing = await db.execute(select(User).where((User.email == email) | (User.username == username)))
    user = existing.scalar_one_or_none()
    if user is None:
        return
    if user.email == email:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Пользователь с таким email уже существует")
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Такой логин уже занят")


@router.post("/register", response_model=VerificationSentOut, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)):
    await _reject_if_taken(db, payload.username, payload.email)

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
    )
    db.add(user)
    await db.flush()
    await issue_email_verification_code(db, user)
    await db.commit()
    return VerificationSentOut(email=user.email)


@router.post("/register/organizer", response_model=VerificationSentOut, status_code=status.HTTP_201_CREATED)
async def register_organizer(payload: OrganizerRegister, db: AsyncSession = Depends(get_db)):
    await _reject_if_taken(db, payload.username, payload.email)

    existing_org = await db.execute(select(Organization).where(Organization.inn == payload.inn))
    if existing_org.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Организация с таким ИНН уже зарегистрирована"
        )

    try:
        legal_type = validate_inn(payload.inn)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    organization = Organization(
        name=payload.org_name, inn=payload.inn, legal_type=legal_type, contact_email=payload.email,
    )
    db.add(organization)
    await db.flush()

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        role=UserRole.organizer,
        organization_id=organization.id,
    )
    db.add(user)
    await db.flush()
    await issue_email_verification_code(db, user)
    await db.commit()
    return VerificationSentOut(email=user.email)


@router.post("/verify-email", response_model=TokenPair)
async def verify_email(payload: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    if user.email_verified:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email уже подтверждён")

    ok = await consume_email_verification_code(db, user, payload.code)
    if not ok:
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный или просроченный код")

    user.email_verified = True
    await db.commit()
    return _token_pair(user.id)


@router.post("/login", response_model=TokenPair)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == payload.username))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")
    if not user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Подтвердите email перед входом")

    user.last_login_at = utcnow()
    db.add(LoginEvent(user_id=user.id))
    await db.commit()
    return _token_pair(user.id)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_data = decode_token(payload.refresh_token)
    if token_data is None or token_data.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный refresh-токен")

    user = await db.get(User, int(token_data["sub"]))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден")
    return _token_pair(user.id)


@router.get("/me", response_model=UserMe)
async def me(user: User = Depends(get_current_user)):
    return user
