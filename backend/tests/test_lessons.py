import pytest

from app.models.gamification import Achievement, AchievementCriteria
from app.models.lesson import CardContentType, Lesson, LessonCard
from app.models.user import UserRole
from tests.helpers import auth_headers, create_user, login

pytestmark = pytest.mark.asyncio


async def _seed_lesson(db_session) -> tuple[int, int]:
    lesson = Lesson(title="Тест", slug="test-lesson", summary="...", points_reward=10)
    db_session.add(lesson)
    await db_session.flush()
    card = LessonCard(
        lesson_id=lesson.id,
        order_index=0,
        content_type=CardContentType.quiz,
        title="Вопрос",
        body="",
        quiz_data={"question": "2+2?", "options": ["3", "4"], "correct_index": 1},
    )
    db_session.add(card)
    db_session.add(
        Achievement(
            code="first_lesson", title="Первые шаги", description="...", icon="📘",
            criteria_type=AchievementCriteria.lessons_completed, criteria_value=1, points_reward=5,
        )
    )
    await db_session.commit()
    return lesson.id, card.id


async def test_complete_lesson_awards_points_and_scores_quiz(client, db_session):
    lesson_id, card_id = await _seed_lesson(db_session)
    await create_user(db_session, "student@example.com")
    token = await login(client, "student@example.com")

    res = await client.post(
        f"/api/v1/lessons/{lesson_id}/complete",
        json={"answers": [{"card_id": card_id, "selected_index": 1}]},
        headers=auth_headers(token),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["score"] == 1
    assert body["max_score"] == 1
    assert body["points_awarded"] == 10
    assert body["already_completed"] is False
    assert "Первые шаги" in body["new_achievements"]

    me = await client.get("/api/v1/users/me", headers=auth_headers(token))
    assert me.json()["points_total"] == 15  # 10 for lesson + 5 achievement bonus

    res = await client.get("/api/v1/notifications", headers=auth_headers(token))
    assert any(n["type"] == "course_completed" for n in res.json())


async def test_complete_lesson_twice_is_idempotent(client, db_session):
    lesson_id, card_id = await _seed_lesson(db_session)
    await create_user(db_session, "twice@example.com")
    token = await login(client, "twice@example.com")

    await client.post(
        f"/api/v1/lessons/{lesson_id}/complete",
        json={"answers": [{"card_id": card_id, "selected_index": 1}]},
        headers=auth_headers(token),
    )
    res = await client.post(
        f"/api/v1/lessons/{lesson_id}/complete", json={"answers": []}, headers=auth_headers(token)
    )
    assert res.status_code == 200
    assert res.json()["already_completed"] is True
    assert res.json()["points_awarded"] == 0

    me = await client.get("/api/v1/users/me", headers=auth_headers(token))
    assert me.json()["points_total"] == 15  # unchanged after second attempt


async def test_wrong_quiz_answer_scores_zero_but_still_awards_completion_points(client, db_session):
    lesson_id, card_id = await _seed_lesson(db_session)
    await create_user(db_session, "wrong@example.com")
    token = await login(client, "wrong@example.com")

    res = await client.post(
        f"/api/v1/lessons/{lesson_id}/complete",
        json={"answers": [{"card_id": card_id, "selected_index": 0}]},
        headers=auth_headers(token),
    )
    body = res.json()
    assert body["score"] == 0
    assert body["points_awarded"] == 10


async def test_organizer_cannot_complete_lesson_for_points(client, db_session):
    lesson_id, card_id = await _seed_lesson(db_session)
    await create_user(db_session, "org-student@example.com", UserRole.organizer)
    token = await login(client, "org-student@example.com")

    res = await client.post(
        f"/api/v1/lessons/{lesson_id}/complete",
        json={"answers": [{"card_id": card_id, "selected_index": 1}]},
        headers=auth_headers(token),
    )
    assert res.status_code == 403


async def test_admin_cannot_complete_lesson_for_points(client, db_session):
    lesson_id, card_id = await _seed_lesson(db_session)
    await create_user(db_session, "admin-student@example.com", UserRole.admin)
    token = await login(client, "admin-student@example.com")

    res = await client.post(
        f"/api/v1/lessons/{lesson_id}/complete",
        json={"answers": [{"card_id": card_id, "selected_index": 1}]},
        headers=auth_headers(token),
    )
    assert res.status_code == 403
