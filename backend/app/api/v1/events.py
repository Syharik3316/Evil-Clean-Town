from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, get_db, require_organizer
from app.models.event import Event, EventRegistration, EventStatus, RegistrationStatus
from app.models.mixins import utcnow
from app.models.user import User
from app.schemas.event import (
    CheckinRequest,
    EventCreate,
    EventOut,
    EventRegistrationOut,
    EventUpdate,
)
from app.services.gamification import award_points, check_achievements
from app.services.geo import haversine_distance_meters

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventOut])
async def list_events(
    upcoming_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Event).where(Event.status == EventStatus.published)
    if upcoming_only:
        stmt = stmt.where(Event.starts_at >= func.now())
    stmt = stmt.order_by(Event.starts_at)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{event_id}", response_model=EventOut)
async def get_event(event_id: int, db: AsyncSession = Depends(get_db)):
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Мероприятие не найдено")
    return event


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    event = Event(organizer_id=user.id, **payload.model_dump())
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.patch("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: int,
    payload: EventUpdate,
    user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Мероприятие не найдено")
    if event.organizer_id != user.id and user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Можно редактировать только свои мероприятия")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, field, value)
    await db.commit()
    await db.refresh(event)
    return event


@router.post("/{event_id}/register", response_model=EventRegistrationOut, status_code=status.HTTP_201_CREATED)
async def register_for_event(
    event_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Мероприятие не найдено")

    existing = await db.execute(
        select(EventRegistration).where(
            EventRegistration.event_id == event_id, EventRegistration.user_id == user.id
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Вы уже зарегистрированы")

    if event.capacity is not None:
        count_result = await db.execute(
            select(func.count()).select_from(EventRegistration).where(EventRegistration.event_id == event_id)
        )
        if count_result.scalar_one() >= event.capacity:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Мест больше нет")

    registration = EventRegistration(event_id=event_id, user_id=user.id)
    db.add(registration)
    await db.commit()
    await db.refresh(registration)
    return registration


@router.post("/{event_id}/checkin", response_model=EventRegistrationOut)
async def checkin(
    event_id: int,
    payload: CheckinRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Мероприятие не найдено")

    result = await db.execute(
        select(EventRegistration).where(
            EventRegistration.event_id == event_id, EventRegistration.user_id == user.id
        )
    )
    registration = result.scalar_one_or_none()
    if registration is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сначала зарегистрируйтесь на мероприятие")
    if registration.status == RegistrationStatus.checked_in:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Чекин уже выполнен")

    distance = haversine_distance_meters(event.lat, event.lon, payload.lat, payload.lon)
    if distance > settings.checkin_radius_meters:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Вы слишком далеко от места проведения ({distance:.0f} м)",
        )

    registration.status = RegistrationStatus.checked_in
    registration.checkin_at = utcnow()
    registration.checkin_lat = payload.lat
    registration.checkin_lon = payload.lon

    await award_points(
        db, user, event.points_reward, reason=f"Участие в мероприятии: {event.title}",
        related_entity_type="event", related_entity_id=event.id,
    )
    await check_achievements(db, user)

    await db.commit()
    await db.refresh(registration)
    return registration


@router.get("/{event_id}/participants", response_model=list[EventRegistrationOut])
async def event_participants(
    event_id: int,
    _user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(EventRegistration).where(EventRegistration.event_id == event_id))
    return result.scalars().all()
