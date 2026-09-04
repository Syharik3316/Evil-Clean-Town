import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, get_db, require_organizer
from app.models.mixins import utcnow
from app.models.report import ReportStatus, TrashReport
from app.models.user import User
from app.schemas.report import ModerationRequest, TrashReportOut
from app.services.gamification import award_points, check_achievements
from app.services.notifications import notify

router = APIRouter(prefix="/reports", tags=["reports"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.post("", response_model=TrashReportOut, status_code=status.HTTP_201_CREATED)
async def submit_report(
    lat: float = Form(...),
    lon: float = Form(...),
    description: str | None = Form(None),
    site_id: int | None = Form(None),
    event_id: int | None = Form(None),
    region: str | None = Form(None),
    photo: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if photo.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Допустимы только изображения JPEG/PNG/WebP")

    contents = await photo.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Файл слишком большой")

    upload_dir = Path(settings.upload_dir) / "reports"
    upload_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(photo.filename or "").suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    (upload_dir / filename).write_bytes(contents)

    report = TrashReport(
        user_id=user.id,
        site_id=site_id,
        event_id=event_id,
        photo_url=f"/uploads/reports/{filename}",
        description=description,
        region=region,
        lat=lat,
        lon=lon,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


@router.get("", response_model=list[TrashReportOut])
async def list_reports(
    mine_only: bool = Query(False),
    status_filter: ReportStatus | None = Query(None),
    sort_by: str = Query("created_at", pattern="^(created_at|region)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TrashReport)
    if mine_only or user.role.value == "volunteer":
        stmt = stmt.where(TrashReport.user_id == user.id)
    if status_filter is not None:
        stmt = stmt.where(TrashReport.status == status_filter)
    sort_column = TrashReport.region if sort_by == "region" else TrashReport.created_at
    stmt = stmt.order_by(sort_column.asc() if order == "asc" else sort_column.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{report_id}", response_model=TrashReportOut)
async def get_report(report_id: int, db: AsyncSession = Depends(get_db)):
    report = await db.get(TrashReport, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Репорт не найден")
    return report


@router.post("/{report_id}/moderate", response_model=TrashReportOut)
async def moderate_report(
    report_id: int,
    payload: ModerationRequest,
    moderator: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    report = await db.get(TrashReport, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Репорт не найден")
    if report.status != ReportStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Репорт уже промодерирован")

    report.status = ReportStatus.approved if payload.approve else ReportStatus.rejected
    report.moderator_id = moderator.id
    report.moderated_at = utcnow()

    author = await db.get(User, report.user_id)
    if payload.approve:
        if author is not None:
            await award_points(
                db, author, report.points_reward, reason="Репорт о мусоре принят",
                related_entity_type="report", related_entity_id=report.id,
            )
            await check_achievements(db, author)
        if author is not None:
            await notify(
                db, author.id, type="report_approved", title="Ваш репорт о мусоре принят",
                body=payload.comment, related_entity_type="report", related_entity_id=report.id,
            )
    else:
        if author is not None:
            await notify(
                db, author.id, type="report_rejected", title="Ваш репорт о мусоре отклонён",
                body=payload.comment, related_entity_type="report", related_entity_id=report.id,
            )

    await db.commit()
    await db.refresh(report)
    return report
