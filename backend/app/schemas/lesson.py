from pydantic import BaseModel, ConfigDict

from app.models.lesson import CardContentType


class LessonCardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int
    content_type: CardContentType
    title: str
    body: str
    quiz_data: dict | None


class LessonCardPublic(BaseModel):
    """Quiz cards hide the correct answer until the lesson is submitted."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int
    content_type: CardContentType
    title: str
    body: str
    quiz_question: str | None = None
    quiz_options: list[str] | None = None


class LessonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    slug: str
    summary: str
    order_index: int
    points_reward: int


class LessonDetail(LessonOut):
    cards: list[LessonCardPublic] = []


class QuizAnswer(BaseModel):
    card_id: int
    selected_index: int


class LessonCompleteRequest(BaseModel):
    answers: list[QuizAnswer] = []


class LessonCompleteResult(BaseModel):
    score: int
    max_score: int
    points_awarded: int
    already_completed: bool
    new_achievements: list[str] = []
