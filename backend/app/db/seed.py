import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select

from app.core.security import hash_password
from app.db.seed_images import generate_pair
from app.db.session import AsyncSessionLocal, engine
from app.models import Base  # imports all model modules, registering them on Base.metadata
from app.models.event import Event, EventType
from app.models.gamification import Achievement, AchievementCriteria
from app.models.lesson import CardContentType, Lesson, LessonCard
from app.models.site import CoastlineSite, LayerType, SatelliteLayer
from app.models.user import Team, TeamType, User, UserRole

logger = logging.getLogger(__name__)

SITES = [
    {"name": "Пляж Лазурный, Анапа", "region": "Краснодарский край", "lat": 44.8951, "lon": 37.3168, "slug": "anapa"},
    {"name": "Коса Тузла, Керчь", "region": "Республика Крым", "lat": 45.3644, "lon": 36.6194, "slug": "kerch"},
    {"name": "Набережная Светлогорска", "region": "Калининградская область", "lat": 54.9436, "lon": 20.1558, "slug": "svetlogorsk"},
]

LESSONS = [
    {
        "title": "Что такое ДЗЗ?",
        "slug": "chto-takoe-dzz",
        "summary": "Знакомимся с дистанционным зондированием Земли и спутниковыми снимками.",
        "cards": [
            ("Спутники на страже берегов", "ДЗЗ (дистанционное зондирование Земли) — это получение информации о поверхности планеты со спутников. Спутник фотографирует Землю в разных диапазонах света, включая невидимые человеческому глазу."),
            ("Зачем это побережью?", "Спутниковые снимки позволяют без выезда на место отслеживать изменения береговой линии, зарастание пляжей мусором и состояние растительности — регулярно и на больших территориях."),
            ("Проверь себя", None, {"question": "Что такое ДЗЗ?", "options": ["Дистанционное зондирование Земли", "Департамент защиты зверей", "Другой закон зоологии"], "correct_index": 0}),
        ],
    },
    {
        "title": "Как читать спутниковый снимок",
        "slug": "kak-chitat-snimok",
        "summary": "Разбираемся, что означают цвета и индексы на снимках.",
        "cards": [
            ("Обычный цвет vs индекс", "На RGB-снимке всё выглядит как обычное фото. Но есть индексы — например NDVI, который показывает количество растительности числом от -1 до 1: чем зеленее, тем гуще растительность."),
            ("Мутность воды", "Индекс мутности воды помогает увидеть загрязнения и взвеси в прибрежной зоне — тёмные пятна у берега часто говорят о стоках или размытии почвы."),
            ("Проверь себя", None, {"question": "Что показывает индекс NDVI?", "options": ["Температуру воды", "Плотность растительности", "Скорость ветра"], "correct_index": 1}),
        ],
    },
    {
        "title": "Почему пластик опасен для берега",
        "slug": "pochemu-plastik-opasen",
        "summary": "Как пластиковый мусор влияет на экосистему побережья.",
        "cards": [
            ("Сотни лет разложения", "Пластиковая бутылка разлагается на берегу от 100 до 450 лет, постепенно превращаясь в микропластик, который попадает в воду и организмы животных."),
            ("Цепочка вреда", "Морские животные путают пластик с едой, микропластик попадает в рыбу, а затем — на стол человека. Каждая уборка берега разрывает эту цепочку."),
            ("Проверь себя", None, {"question": "Во что постепенно превращается пластик на берегу?", "options": ["В песок", "В микропластик", "В соль"], "correct_index": 1}),
        ],
    },
    {
        "title": "Как работает мониторинг побережья",
        "slug": "kak-rabotaet-monitoring",
        "summary": "От спутникового снимка до реальной уборки — весь путь данных.",
        "cards": [
            ("От снимка к решению", "Спутник делает снимок → алгоритмы выделяют аномалии (мусор, изменение береговой линии) → фонд и волонтёры получают список приоритетных участков → организуется уборка."),
            ("Роль citizen science", "Люди на местах — важное дополнение к спутникам: фотографии с телефона подтверждают находки и уточняют данные там, где спутниковый снимок неточен (облачность, разрешение)."),
        ],
    },
]

ACHIEVEMENTS = [
    {"code": "first_lesson", "title": "Первые шаги", "description": "Пройден первый урок", "icon": "📘", "criteria_type": AchievementCriteria.lessons_completed, "criteria_value": 1, "points_reward": 5},
    {"code": "all_lessons", "title": "Эко-эрудит", "description": "Пройдены все обучающие модули", "icon": "🎓", "criteria_type": AchievementCriteria.lessons_completed, "criteria_value": 4, "points_reward": 20},
    {"code": "first_event", "title": "Первая уборка", "description": "Отмечено участие в первом мероприятии", "icon": "🧹", "criteria_type": AchievementCriteria.events_attended, "criteria_value": 1, "points_reward": 15},
    {"code": "five_events", "title": "Постоянный волонтёр", "description": "Отмечено участие в 5 мероприятиях", "icon": "🌊", "criteria_type": AchievementCriteria.events_attended, "criteria_value": 5, "points_reward": 40},
    {"code": "first_report", "title": "Дозорный берега", "description": "Первый принятый репорт о мусоре", "icon": "📸", "criteria_type": AchievementCriteria.reports_approved, "criteria_value": 1, "points_reward": 10},
    {"code": "points_100", "title": "Сотня добрых дел", "description": "Набрано 100 баллов", "icon": "⭐", "criteria_type": AchievementCriteria.points_threshold, "criteria_value": 100, "points_reward": 10},
    {"code": "points_500", "title": "Хранитель берега", "description": "Набрано 500 баллов", "icon": "🏆", "criteria_type": AchievementCriteria.points_threshold, "criteria_value": 500, "points_reward": 25},
]


async def seed() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).limit(1))
        if existing.scalar_one_or_none() is not None:
            logger.info("Seed skipped: data already present")
            return

        team = Team(name="Эко-клуб «Чистый берег»", type=TeamType.club, city="Анапа")
        db.add(team)
        await db.flush()

        admin = User(
            email="admin@chistybereg.ru", password_hash=hash_password("admin12345"),
            display_name="Администратор фонда", role=UserRole.admin,
        )
        organizer = User(
            email="organizer@chistybereg.ru", password_hash=hash_password("organizer12345"),
            display_name="Организатор эко-клуба", role=UserRole.organizer, team_id=team.id,
        )
        volunteer = User(
            email="volunteer@chistybereg.ru", password_hash=hash_password("volunteer12345"),
            display_name="Волонтёр Аня", role=UserRole.volunteer, team_id=team.id,
        )
        db.add_all([admin, organizer, volunteer])
        await db.flush()

        image_dir = Path(__file__).parent.parent / "static" / "satellite"
        site_objs = []
        for s in SITES:
            site = CoastlineSite(name=s["name"], region=s["region"], lat=s["lat"], lon=s["lon"],
                                  description="Демонстрационный участок побережья для показа слайдера «до/после».")
            db.add(site)
            await db.flush()
            site_objs.append(site)

            before_name, after_name = generate_pair(image_dir, s["slug"])
            d = 0.006
            bounds = [[s["lat"] - d, s["lon"] - d], [s["lat"] + d, s["lon"] + d]]
            db.add_all([
                SatelliteLayer(
                    site_id=site.id, captured_at=date.today() - timedelta(days=60), layer_type=LayerType.rgb,
                    label="До уборки", image_url=f"/static/satellite/{before_name}", bounds=bounds, order_index=0,
                ),
                SatelliteLayer(
                    site_id=site.id, captured_at=date.today() - timedelta(days=3), layer_type=LayerType.rgb,
                    label="После уборки", image_url=f"/static/satellite/{after_name}", bounds=bounds, order_index=1,
                ),
            ])

        for idx, lesson_data in enumerate(LESSONS):
            lesson = Lesson(
                title=lesson_data["title"], slug=lesson_data["slug"], summary=lesson_data["summary"],
                order_index=idx, points_reward=10,
            )
            db.add(lesson)
            await db.flush()
            for card_idx, card in enumerate(lesson_data["cards"]):
                title, body, *quiz = card
                quiz_data = quiz[0] if quiz else None
                db.add(LessonCard(
                    lesson_id=lesson.id, order_index=card_idx,
                    content_type=CardContentType.quiz if quiz_data else CardContentType.text,
                    title=title, body=body or "", quiz_data=quiz_data,
                ))

        for a in ACHIEVEMENTS:
            db.add(Achievement(**a))

        db.add(Event(
            title="Уборка пляжа в Анапе", description="Собираемся у входа на пляж Лазурный, приносите перчатки и хорошее настроение!",
            event_type=EventType.cleanup, site_id=site_objs[0].id, organizer_id=organizer.id,
            starts_at=datetime.now(timezone.utc) + timedelta(days=7), address="Анапа, пляж Лазурный",
            lat=SITES[0]["lat"], lon=SITES[0]["lon"], capacity=50, points_reward=25,
        ))
        db.add(Event(
            title="Онлайн-вебинар: читаем спутниковые снимки", description="Эксперт «СР Дата» расскажет, как устроен спутниковый мониторинг побережья.",
            event_type=EventType.webinar, site_id=None, organizer_id=admin.id,
            starts_at=datetime.now(timezone.utc) + timedelta(days=3), address="Онлайн",
            lat=55.751244, lon=37.618423, capacity=None, points_reward=10,
        ))

        await db.commit()
        logger.info("Seed complete")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(seed())
