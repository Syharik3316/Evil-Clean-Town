from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, get_db, require_admin
from app.models.lesson import CardContentType, Lesson, LessonCard, UserLessonProgress
from app.models.user import User
from app.schemas.lesson import (
    LessonCardPublic,
    LessonCompleteRequest,
    LessonCompleteResult,
    LessonDetail,
    LessonOut,
)
from app.services.gamification import award_points, check_achievements

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


@router.get("", response_model=list[LessonOut])
async def list_lessons(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Lesson).where(Lesson.published.is_(True)).order_by(Lesson.order_index)
    )
    return result.scalars().all()


@router.get("/{lesson_id}", response_model=LessonDetail)
async def get_lesson(lesson_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id).options(selectinload(Lesson.cards))
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")
    return LessonDetail(
        id=lesson.id,
        title=lesson.title,
        slug=lesson.slug,
        summary=lesson.summary,
        order_index=lesson.order_index,
        points_reward=lesson.points_reward,
        cards=[_to_public_card(c) for c in lesson.cards],
    )


@router.post("/{lesson_id}/complete", response_model=LessonCompleteResult)
async def complete_lesson(
    lesson_id: int,
    payload: LessonCompleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id).options(selectinload(Lesson.cards))
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")

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

    await db.commit()

    return LessonCompleteResult(
        score=score,
        max_score=len(quiz_cards),
        points_awarded=lesson.points_reward,
        already_completed=False,
        new_achievements=new_achievements,
    )


@router.post("/{lesson_id}/cards", status_code=status.HTTP_201_CREATED)
async def add_card(
    lesson_id: int,
    title: str,
    body: str,
    content_type: CardContentType = CardContentType.text,
    order_index: int = 0,
    quiz_data: dict | None = None,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Урок не найден")
    card = LessonCard(
        lesson_id=lesson_id,
        title=title,
        body=body,
        content_type=content_type,
        order_index=order_index,
        quiz_data=quiz_data,
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return {"id": card.id}
