from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import OrganizationStatus, User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось подтвердить учётные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_error

    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise credentials_error

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_error

    user = await db.get(User, int(user_id))
    if user is None:
        raise credentials_error
    return user


async def get_current_user_optional(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if token is None:
        return None
    try:
        return await get_current_user(token=token, db=db)
    except HTTPException:
        return None


def require_roles(*roles: UserRole):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        return user

    return checker


require_organizer = require_roles(UserRole.organizer, UserRole.admin)
require_admin = require_roles(UserRole.admin)


def ensure_organization_approved(user: User) -> None:
    """Организатор с непроверенной организацией не может создавать мероприятия/курсы —
    только просматривать и ждать решения администрации (см. /admin/tickets/organizations).
    Админа и волонтёров (у них нет organization) это не касается."""
    if user.role != UserRole.organizer or user.organization is None:
        return
    if user.organization.status == OrganizationStatus.approved:
        return
    if user.organization.status == OrganizationStatus.rejected:
        detail = "Ваша организация отклонена администрацией"
        if user.organization.rejection_reason:
            detail += f": {user.organization.rejection_reason}"
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Ваша организация ещё не подтверждена администрацией",
    )
