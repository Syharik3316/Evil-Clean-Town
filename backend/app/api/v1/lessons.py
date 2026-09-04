from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, get_current_user_optional, get_db, require_admin, require_organizer
from app.models.lesson import CardContentType, Lesson, LessonCard, LessonStatus, UserLessonProgress
from app.models.user import User, UserRole
from app.schemas.lesson import (
    LessonCardCreate,
    LessonCardOut,
    LessonCardPublic,
    LessonCardUpdate,
    LessonCompleteRequest,
    LessonCompleteResult,
    LessonCreate,
    LessonDetail,
    LessonDetailFull,
    LessonOut,
    LessonUpdate,
)
from app.services.gamification import award_points, check_achievements
from app.services.notifications import notify

router = APIRouter(prefix="/lessons", tags=["lessons"])


def _to_public_card(card: LessonCard) -> LessonCardPublic:
    quiz_question = None
    quiz_options = None
    if card.content_type == CardContentType.quiz and card.quiz_data:
        quiz_question = card.quiz_data.get("question")
        quiz_options = card.quiz_data.get("options")
    return LessonCardPublic(
        id=card.id,
        order_index=card.order_index,
        content_type=card.content_type,
        title=card.title,
        body=card.body,
        quiz_question=quiz_question,
        quiz_options=quiz_options,
    )


def _ensure_lesson_owner(lesson: Lesson, user: User) -> None:
    if lesson.created_by_id != user.id and user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Можно редактировать только свои курсы")


async def _get_lesson_with_cards(db: AsyncSession, lesson_id: int) -> Lesson:
    result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id).options(selectinload(Lesson.cards))
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")
    return lesson


@router.get("", response_model=list[LessonOut])
async def list_lessons(
    mine_only: bool = Query(False),
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Lesson)
    if mine_only:
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется вход")
        stmt = stmt.where(Lesson.created_by_id == user.id)
    else:
        stmt = stmt.where(Lesson.status == LessonStatus.published)
    stmt = stmt.order_by(Lesson.order_index)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{lesson_id}")
async def get_lesson(
    lesson_id: int,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_with_cards(db, lesson_id)
    is_owner = user is not None and (user.id == lesson.created_by_id or user.role == UserRole.admin)
    if lesson.status != LessonStatus.published and not is_owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")

    base = LessonOut.model_validate(lesson).model_dump()
    if is_owner:
        # автору/админу нужны правильные ответы квизов для редактирования
        return LessonDetailFull(**base, cards=[LessonCardOut.model_validate(c) for c in lesson.cards])
    return LessonDetail(**base, cards=[_to_public_card(c) for c in lesson.cards])


@router.post("", response_model=LessonOut, status_code=status.HTTP_201_CREATED)
async def create_lesson(
    payload: LessonCreate,
    user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    status_value = LessonStatus.published if user.role == UserRole.admin else LessonStatus.draft
    lesson = Lesson(**payload.model_dump(), created_by_id=user.id, status=status_value)
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)
    return lesson


@router.patch("/{lesson_id}", response_model=LessonOut)
async def update_lesson(
    lesson_id: int,
    payload: LessonUpdate,
    user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")
    _ensure_lesson_owner(lesson, user)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lesson, field, value)
    await db.commit()
    await db.refresh(lesson)
    return lesson


@router.post("/{lesson_id}/submit", response_model=LessonOut)
async def submit_lesson(
    lesson_id: int,
    user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")
    _ensure_lesson_owner(lesson, user)
    if lesson.status not in (LessonStatus.draft, LessonStatus.rejected):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Курс уже отправлен или опубликован")

    lesson.status = LessonStatus.pending_review
    await db.commit()
    await db.refresh(lesson)
    return lesson


@router.post("/{lesson_id}/set-base-course", response_model=LessonOut)
async def set_base_course(
    lesson_id: int,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")
    if lesson.status != LessonStatus.published:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Базовым курсом может быть только опубликованный курс")

    result = await db.execute(select(Lesson).where(Lesson.is_base_course.is_(True)))
    for other in result.scalars().all():
        other.is_base_course = False
    lesson.is_base_course = True

    await db.commit()
    await db.refresh(lesson)
    return lesson


@router.post("/{lesson_id}/complete", response_model=LessonCompleteResult)
async def complete_lesson(
    lesson_id: int,
    payload: LessonCompleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_with_cards(db, lesson_id)

    existing = await db.execute(
        select(UserLessonProgress).where(
            UserLessonProgress.user_id == user.id, UserLessonProgress.lesson_id == lesson_id
        )
    )
    progress = existing.scalar_one_or_none()

    quiz_cards = [c for c in lesson.cards if c.content_type == CardContentType.quiz]
    answers_by_card = {a.card_id: a.selected_index for a in payload.answers}
    score = sum(
        1
        for c in quiz_cards
        if c.quiz_data and answers_by_card.get(c.id) == c.quiz_data.get("correct_index")
    )

    if progress is not None:
        return LessonCompleteResult(
            score=progress.score,
            max_score=len(quiz_cards),
            points_awarded=0,
            already_completed=True,
            new_achievements=[],
        )

    progress = UserLessonProgress(user_id=user.id, lesson_id=lesson_id, score=score)
    db.add(progress)

    await award_points(
        db, user, lesson.points_reward, reason=f"Урок пройден: {lesson.title}",
        related_entity_type="lesson", related_entity_id=lesson.id,
    )
    new_achievements = await check_achievements(db, user)
    await notify(
        db, user.id, type="course_completed", title=f"Вы прошли курс «{lesson.title}»",
        related_entity_type="lesson", related_entity_id=lesson.id,
    )

    await db.commit()

    return LessonCompleteResult(
        score=score,
        max_score=len(quiz_cards),
        points_awarded=lesson.points_reward,
        already_completed=False,
        new_achievements=new_achievements,
    )


@router.post("/{lesson_id}/cards", response_model=LessonCardOut, status_code=status.HTTP_201_CREATED)
async def add_card(
    lesson_id: int,
    payload: LessonCardCreate,
    user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")
    _ensure_lesson_owner(lesson, user)

    card = LessonCard(lesson_id=lesson_id, **payload.model_dump())
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return card


@router.patch("/{lesson_id}/cards/{card_id}", response_model=LessonCardOut)
async def update_card(
    lesson_id: int,
    card_id: int,
    payload: LessonCardUpdate,
    user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")
    _ensure_lesson_owner(lesson, user)

    card = await db.get(LessonCard, card_id)
    if card is None or card.lesson_id != lesson_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Карточка не найдена")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(card, field, value)
    await db.commit()
    await db.refresh(card)
    return card


@router.delete("/{lesson_id}/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_card(
    lesson_id: int,
    card_id: int,
    user: User = Depends(require_organizer),
    db: AsyncSession = Depends(get_db),
):
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")
    _ensure_lesson_owner(lesson, user)

    card = await db.get(LessonCard, card_id)
    if card is None or card.lesson_id != lesson_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Карточка не найдена")

    await db.delete(card)
    await db.commit()
