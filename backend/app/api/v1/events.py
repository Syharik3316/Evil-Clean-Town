from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, get_current_user_optional, get_db
from app.models.event import Event, EventRegistration, EventRole, EventStatus, EventType, RegistrationStatus
from app.models.gamification import UserAchievement
from app.models.lesson import Lesson, LessonStatus, UserLessonProgress
from app.models.mixins import ensure_aware, utcnow
from app.models.user import User, UserRole
from app.schemas.event import (
    ApplicantDecisionRequest,
    ApplicantOut,
    ApplicantVolunteerInfo,
    BonusPointsRequest,
    CheckinRequest,
    EventCreate,
    EventOut,
    EventRegistrationOut,
    EventRoleCreate,
    EventRoleOut,
    EventUpdate,
    FeatureApplicantRequest,
    RegisterForEventRequest,
)
from app.schemas.lesson import AttachCourseRequest
from app.services.gamification import award_points, check_achievements, update_streak
from app.services.geo import haversine_distance_meters
from app.services.notifications import notify

router = APIRouter(prefix="/events", tags=["events"])

ACTIVE_REGISTRATION_STATUSES = (
    RegistrationStatus.pending,
    RegistrationStatus.approved,
    RegistrationStatus.checked_in,
)


async def _has_completed_lesson(db: AsyncSession, user_id: int, lesson_id: int) -> bool:
    result = await db.execute(
        select(UserLessonProgress).where(
            UserLessonProgress.user_id == user_id, UserLessonProgress.lesson_id == lesson_id
        )
    )
    return result.scalar_one_or_none() is not None


def _ensure_event_owner(event: Event, user: User) -> None:
    if event.organizer_id != user.id and user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Можно управлять только своими мероприятиями"
        )


@router.get("", response_model=list[EventOut])
async def list_events(
    upcoming_only: bool = Query(True),
    mine_only: bool = Query(False),
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Event)
    if mine_only:
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется вход")
        stmt = stmt.where(Event.organizer_id == user.id)
    else:
        stmt = stmt.where(Event.status == EventStatus.published)
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
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role == UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Администратор не создаёт мероприятия, а модерирует их в тикетах",
        )
    if payload.event_type == EventType.cleanup and payload.site_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Для уборки нужно выбрать участок побережья (site_id) — это связывает мероприятие со спутниковым мониторингом",
        )

    data = payload.model_dump(exclude={"roles"})
    event = Event(organizer_id=user.id, status=EventStatus.pending_review, **data)
    db.add(event)
    await db.flush()
    for role in payload.roles:
        db.add(EventRole(event_id=event.id, **role.model_dump()))
    await db.commit()
    await db.refresh(event)
    return event


@router.patch("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: int,
    payload: EventUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Мероприятие не найдено")
    _ensure_event_owner(event, user)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, field, value)
    await db.commit()
    await db.refresh(event)
    return event


@router.post("/{event_id}/roles", response_model=EventRoleOut, status_code=status.HTTP_201_CREATED)
async def add_event_role(
    event_id: int,
    payload: EventRoleCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Мероприятие не найдено")
    _ensure_event_owner(event, user)

    role = EventRole(event_id=event_id, **payload.model_dump())
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role


@router.post("/{event_id}/close-registration", response_model=EventOut)
async def close_registration(
    event_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Мероприятие не найдено")
    _ensure_event_owner(event, user)

    event.applications_closed_at = utcnow()
    await db.commit()
    await db.refresh(event)
    return event


@router.post("/{event_id}/attach-course", response_model=EventOut)
async def attach_course(
    event_id: int,
    payload: AttachCourseRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Мероприятие не найдено")
    _ensure_event_owner(event, user)

    if payload.lesson_id is not None:
        lesson = await db.get(Lesson, payload.lesson_id)
        if lesson is None or lesson.status != LessonStatus.published:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Можно прикрепить только опубликованный курс"
            )

    event.prerequisite_lesson_id = payload.lesson_id
    await db.commit()
    await db.refresh(event)
    return event


@router.post("/{event_id}/register", response_model=EventRegistrationOut, status_code=status.HTTP_201_CREATED)
async def register_for_event(
    event_id: int,
    payload: RegisterForEventRequest = RegisterForEventRequest(),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role == UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Администратор не может участвовать в мероприятиях"
        )

    event = await db.get(Event, event_id)
    if event is None or event.status != EventStatus.published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Мероприятие не найдено")

    if event.applications_closed_at is not None and ensure_aware(event.applications_closed_at) <= utcnow():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Набор на мероприятие закрыт")

    if event.event_type == EventType.cleanup:
        if not user.age_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Для записи на уборку нужно подтвердить возраст (14+) в профиле",
            )
        base_course = (
            await db.execute(select(Lesson).where(Lesson.is_base_course.is_(True)))
        ).scalar_one_or_none()
        if base_course is not None and not await _has_completed_lesson(db, user.id, base_course.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Сначала пройдите базовый курс волонтёра «{base_course.title}»",
            )

    if event.prerequisite_lesson_id is not None and not await _has_completed_lesson(
        db, user.id, event.prerequisite_lesson_id
    ):
        prereq = await db.get(Lesson, event.prerequisite_lesson_id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Для записи на это мероприятие нужно пройти курс «{prereq.title if prereq else ''}»",
        )

    existing = await db.execute(
        select(EventRegistration).where(
            EventRegistration.event_id == event_id, EventRegistration.user_id == user.id
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Вы уже подавали заявку")

    if event.capacity is not None:
        count_result = await db.execute(
            select(func.count())
            .select_from(EventRegistration)
            .where(
                EventRegistration.event_id == event_id,
                EventRegistration.status.in_(ACTIVE_REGISTRATION_STATUSES),
            )
        )
        if count_result.scalar_one() >= event.capacity:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Мест больше нет")

    role_id = payload.role_id
    if role_id is not None:
        role = await db.get(EventRole, role_id)
        if role is None or role.event_id != event_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Роль не найдена у этого мероприятия")
        if role.capacity is not None:
            role_count = await db.execute(
                select(func.count())
                .select_from(EventRegistration)
                .where(
                    EventRegistration.role_id == role_id,
                    EventRegistration.status.in_(ACTIVE_REGISTRATION_STATUSES),
                )
            )
            if role_count.scalar_one() >= role.capacity:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="На эту роль мест больше нет")

    registration = EventRegistration(event_id=event_id, user_id=user.id, role_id=role_id)
    db.add(registration)
    await notify(
        db, user.id, type="registration_submitted", title=f"Вы отправили заявку на «{event.title}»",
        related_entity_type="event", related_entity_id=event.id,
    )
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сначала подайте заявку на мероприятие")
    if registration.status == RegistrationStatus.checked_in:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Чекин уже выполнен")
    if registration.status != RegistrationStatus.approved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Чекин доступен только после одобрения заявки организатором",
        )

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
    await db.flush()
    await update_streak(db, user)
    await check_achievements(db, user)

    await db.commit()
    await db.refresh(registration)
    return registration


async def _volunteer_info(db: AsyncSession, user: User) -> ApplicantVolunteerInfo:
    events_attended = (
        await db.execute(
            select(func.count())
            .select_from(EventRegistration)
            .where(
                EventRegistration.user_id == user.id,
                EventRegistration.status == RegistrationStatus.checked_in,
            )
        )
    ).scalar_one()
    achievements_count = (
        await db.execute(
            select(func.count()).select_from(UserAchievement).where(UserAchievement.user_id == user.id)
        )
    ).scalar_one()
    return ApplicantVolunteerInfo(
        id=user.id,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        points_total=user.points_total,
        events_attended=events_attended,
        achievements_count=achievements_count,
    )


@router.get("/{event_id}/applicants", response_model=list[ApplicantOut])
async def event_applicants(
    event_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Мероприятие не найдено")
    _ensure_event_owner(event, user)

    result = await db.execute(select(EventRegistration).where(EventRegistration.event_id == event_id))
    registrations = result.scalars().all()

    applicants = []
    for reg in registrations:
        volunteer = await db.get(User, reg.user_id)
        info = await _volunteer_info(db, volunteer)
        applicants.append(ApplicantOut(**EventRegistrationOut.model_validate(reg).model_dump(), volunteer=info))
    return applicants


async def _get_owned_registration(db: AsyncSession, event_id: int, reg_id: int, user: User) -> EventRegistration:
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Мероприятие не найдено")
    _ensure_event_owner(event, user)

    registration = await db.get(EventRegistration, reg_id)
    if registration is None or registration.event_id != event_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заявка не найдена")
    return registration


@router.patch("/{event_id}/applicants/{reg_id}", response_model=EventRegistrationOut)
async def decide_applicant(
    event_id: int,
    reg_id: int,
    payload: ApplicantDecisionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.status not in (RegistrationStatus.approved, RegistrationStatus.rejected):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Допустимые решения: approved, rejected")
    if payload.status == RegistrationStatus.rejected and not payload.reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Укажите причину отказа")

    registration = await _get_owned_registration(db, event_id, reg_id, user)
    event = await db.get(Event, event_id)
    registration.status = payload.status
    registration.rejection_reason = payload.reason if payload.status == RegistrationStatus.rejected else None

    if payload.status == RegistrationStatus.approved:
        await notify(
            db, registration.user_id, type="registration_approved",
            title=f"Вас одобрили на «{event.title}»",
            related_entity_type="event", related_entity_id=event_id,
        )
    else:
        await notify(
            db, registration.user_id, type="registration_rejected",
            title=f"Вас отклонили от «{event.title}»", body=payload.reason,
            related_entity_type="event", related_entity_id=event_id,
        )

    await db.commit()
    await db.refresh(registration)
    return registration


@router.post("/{event_id}/applicants/{reg_id}/bonus-points", response_model=EventRegistrationOut)
async def award_bonus_points(
    event_id: int,
    reg_id: int,
    payload: BonusPointsRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    registration = await _get_owned_registration(db, event_id, reg_id, user)
    volunteer = await db.get(User, registration.user_id)
    await award_points(
        db, volunteer, payload.amount, reason=payload.reason,
        related_entity_type="event_bonus", related_entity_id=registration.id,
    )
    await check_achievements(db, volunteer)
    await db.commit()
    await db.refresh(registration)
    return registration


@router.post("/{event_id}/applicants/{reg_id}/feature", response_model=EventRegistrationOut)
async def feature_applicant(
    event_id: int,
    reg_id: int,
    payload: FeatureApplicantRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    registration = await _get_owned_registration(db, event_id, reg_id, user)
    registration.is_featured = payload.is_featured
    registration.special_note = payload.special_note
    await db.commit()
    await db.refresh(registration)
    return registration
