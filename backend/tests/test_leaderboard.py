import pytest

from app.services.gamification import award_points
from tests.helpers import create_user

pytestmark = pytest.mark.asyncio


async def test_leaderboard_sorted_by_points_desc(client, db_session):
    low = await create_user(db_session, "low@example.com")
    high = await create_user(db_session, "high@example.com")

    await award_points(db_session, low, 5, reason="test")
    await award_points(db_session, high, 50, reason="test")
    await db_session.commit()

    res = await client.get("/api/v1/leaderboard?scope=users")
    assert res.status_code == 200
    names = [row["name"] for row in res.json()]
    assert names.index("high") < names.index("low")
