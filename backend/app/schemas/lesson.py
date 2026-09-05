from pydantic import BaseModel, ConfigDict, model_validator

from app.models.lesson import CardContentType, LessonStatus


class LessonCardCreate(BaseModel):
    title: str
    body: str = ""
    content_type: CardContentType = CardContentType.text
    order_index: int = 0
    quiz_data: dict | None = None
    video_url: str | None = None

    @model_validator(mode="after")
    def _require_video_url(self):
        if self.content_type == CardContentType.video and not self.video_url:
            raise ValueError("Для видео-карточки нужна ссылка на видео (video_url)")
        return self


class LessonCardUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    content_type: CardContentType | None = None
    order_index: int | None = None
    quiz_data: dict | None = None
    video_url: str | None = None


class LessonCardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int
    content_type: CardContentType
    title: str
    body: str
    quiz_data: dict | None
    video_url: str | None = None


class LessonCardPublic(BaseModel):
    """Quiz cards hide the correct answer until the lesson is submitted."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    order_index: int
    content_type: CardContentType
    title: str
    body: str
    video_url: str | None = None
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
    status: LessonStatus
    is_base_course: bool
    created_by_id: int | None


class LessonDetail(LessonOut):
    cards: list[LessonCardPublic] = []


class LessonDetailFull(LessonOut):
    """Полный вид с правильными ответами — для автора/админа при редактировании."""

    cards: list[LessonCardOut] = []


class LessonCreate(BaseModel):
    title: str
    slug: str
    summary: str
    order_index: int = 0
    points_reward: int = 10


class LessonUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    order_index: int | None = None
    points_reward: int | None = None


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


class AttachCourseRequest(BaseModel):
    lesson_id: int | None
