from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.deps import get_db, require_admin
from app.models.event import Event, EventStatus
from app.models.lesson import Lesson, LessonStatus
from app.models.user import Organization, OrganizationStatus, User
from app.schemas.event import EventOut, EventUpdate
from app.schemas.lesson import LessonOut, LessonUpdate
from app.schemas.ticket import TicketRejectRequest
from app.schemas.user import OrganizationTicketOut
from app.services.notifications import notify

router = APIRouter(prefix="/admin", tags=["admin-tickets"])


@router.get("/tickets/events", response_model=list[EventOut])
async def list_event_tickets(
    ticket_status: EventStatus = Query(EventStatus.pending_review, alias="status"),
    sort_by: str = Query("created_at", pattern="^(created_at|region|organization)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    organizer = aliased(User)
    stmt = (
        select(Event)
        .join(organizer, Event.organizer_id == organizer.id)
        .outerjoin(Organization, organizer.organization_id == Organization.id)
        .where(Event.status == ticket_status)
    )
    if sort_by == "organization":
        order_col = Organization.name
    elif sort_by == "region":
        order_col = Event.region
    else:
        order_col = Event.created_at
    stmt = stmt.order_by(order_col.asc() if order == "asc" else order_col.desc())

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/events", response_model=list[EventOut])
async def list_all_events_history(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Event).order_by(Event.created_at.desc()))
    return result.scalars().all()


async def _get_ticket_event(db: AsyncSession, event_id: int) -> Event:
    event = await db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Мероприятие не найдено")
    if event.status != EventStatus.pending_review:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Мероприятие уже рассмотрено")
    return event


@router.post("/tickets/events/{event_id}/approve", response_model=EventOut)
async def approve_event_ticket(
    event_id: int, _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    event = await _get_ticket_event(db, event_id)
    event.status = EventStatus.published
    await notify(
        db, event.organizer_id, type="event_approved", title=f"Мероприятие «{event.title}» опубликовано",
        related_entity_type="event", related_entity_id=event.id,
    )
    await db.commit()
    await db.refresh(event)
    return event


@router.post("/tickets/events/{event_id}/reject", response_model=EventOut)
async def reject_event_ticket(
    event_id: int,
    payload: TicketRejectRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    event = await _get_ticket_event(db, event_id)
    event.status = EventStatus.rejected
    await notify(
        db, event.organizer_id, type="event_rejected", title=f"Мероприятие «{event.title}» отклонено",
        body=payload.reason, related_entity_type="event", related_entity_id=event.id,
    )
    await db.commit()
    await db.refresh(event)
    return event


@router.post("/tickets/events/{event_id}/edit-approve", response_model=EventOut)
async def edit_and_approve_event_ticket(
    event_id: int,
    payload: EventUpdate,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    event = await _get_ticket_event(db, event_id)
    for field, value in payload.model_dump(exclude_unset=True, exclude={"status"}).items():
        setattr(event, field, value)
    event.status = EventStatus.published
    await notify(
        db, event.organizer_id, type="event_approved",
        title=f"Мероприятие «{event.title}» опубликовано (с правками модератора)",
        related_entity_type="event", related_entity_id=event.id,
    )
    await db.commit()
    await db.refresh(event)
    return event


@router.get("/tickets/courses", response_model=list[LessonOut])
async def list_course_tickets(
    sort_by: str = Query("created_at", pattern="^(created_at)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Lesson).where(Lesson.status == LessonStatus.pending_review)
    stmt = stmt.order_by(Lesson.created_at.asc() if order == "asc" else Lesson.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


async def _get_ticket_lesson(db: AsyncSession, lesson_id: int) -> Lesson:
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Курс не найден")
    if lesson.status != LessonStatus.pending_review:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Курс уже рассмотрен")
    return lesson


@router.post("/tickets/courses/{lesson_id}/approve", response_model=LessonOut)
async def approve_course_ticket(
    lesson_id: int, _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    lesson = await _get_ticket_lesson(db, lesson_id)
    lesson.status = LessonStatus.published
    if lesson.created_by_id is not None:
        await notify(
            db, lesson.created_by_id, type="course_approved", title=f"Курс «{lesson.title}» опубликован",
            related_entity_type="lesson", related_entity_id=lesson.id,
        )
    await db.commit()
    await db.refresh(lesson)
    return lesson


@router.post("/tickets/courses/{lesson_id}/reject", response_model=LessonOut)
async def reject_course_ticket(
    lesson_id: int,
    payload: TicketRejectRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_ticket_lesson(db, lesson_id)
    lesson.status = LessonStatus.rejected
    if lesson.created_by_id is not None:
        await notify(
            db, lesson.created_by_id, type="course_rejected", title=f"Курс «{lesson.title}» отклонён",
            body=payload.reason, related_entity_type="lesson", related_entity_id=lesson.id,
        )
    await db.commit()
    await db.refresh(lesson)
    return lesson


@router.post("/tickets/courses/{lesson_id}/edit-approve", response_model=LessonOut)
async def edit_and_approve_course_ticket(
    lesson_id: int,
    payload: LessonUpdate,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_ticket_lesson(db, lesson_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lesson, field, value)
    lesson.status = LessonStatus.published
    if lesson.created_by_id is not None:
        await notify(
            db, lesson.created_by_id, type="course_approved",
            title=f"Курс «{lesson.title}» опубликован (с правками модератора)",
            related_entity_type="lesson", related_entity_id=lesson.id,
        )
    await db.commit()
    await db.refresh(lesson)
    return lesson


@router.get("/tickets/organizations", response_model=list[OrganizationTicketOut])
async def list_organization_tickets(
    ticket_status: OrganizationStatus = Query(OrganizationStatus.pending, alias="status"),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Organization).where(Organization.status == ticket_status).order_by(Organization.created_at.desc())
    )
    return result.scalars().all()


async def _get_ticket_organization(db: AsyncSession, org_id: int) -> Organization:
    organization = await db.get(Organization, org_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Организация не найдена")
    if organization.status != OrganizationStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Организация уже рассмотрена")
    return organization


async def _notify_organization_members(db: AsyncSession, org_id: int, **notify_kwargs) -> None:
    result = await db.execute(select(User.id).where(User.organization_id == org_id))
    for user_id in result.scalars().all():
        await notify(db, user_id, **notify_kwargs)


@router.post("/tickets/organizations/{org_id}/approve", response_model=OrganizationTicketOut)
async def approve_organization_ticket(
    org_id: int, _admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    organization = await _get_ticket_organization(db, org_id)
    organization.status = OrganizationStatus.approved
    organization.rejection_reason = None
    await _notify_organization_members(
        db, org_id, type="organization_approved",
        title=f"Организация «{organization.name}» подтверждена администрацией",
        related_entity_type="organization", related_entity_id=organization.id,
    )
    await db.commit()
    await db.refresh(organization)
    return organization


@router.post("/tickets/organizations/{org_id}/reject", response_model=OrganizationTicketOut)
async def reject_organization_ticket(
    org_id: int,
    payload: TicketRejectRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    organization = await _get_ticket_organization(db, org_id)
    organization.status = OrganizationStatus.rejected
    organization.rejection_reason = payload.reason
    await _notify_organization_members(
        db, org_id, type="organization_rejected",
        title=f"Организация «{organization.name}» отклонена администрацией",
        body=payload.reason, related_entity_type="organization", related_entity_id=organization.id,
    )
    await db.commit()
    await db.refresh(organization)
    return organization
