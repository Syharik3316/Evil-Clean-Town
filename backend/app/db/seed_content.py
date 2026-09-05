"""Идемпотентный сид справочного контента платформы: участки побережья со снимками
до/после, обучающие курсы (включая базовый курс волонтёра) и ачивки.

Это не демо-данные и не тестовые аккаунты — это реальный контент, без которого разделы
«Карта», «Уроки» и ачивки будут пустыми, поэтому сидер запускается всегда при старте
(entrypoint.sh), а не по флагу. Каждый элемент добавляется независимо и только если его
ещё нет (по name/slug/code) — безопасно перезапускать на уже заполненной БД.
"""
import asyncio
import logging
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import select

from app.db.seed_images import generate_pair
from app.db.session import AsyncSessionLocal
from app.models.gamification import Achievement, AchievementCriteria
from app.models.lesson import CardContentType, Lesson, LessonCard
from app.models.site import CoastlineSite, LayerType, SatelliteLayer

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

BASE_COURSE = {
    "title": "Базовый курс волонтёра: ТБ и участие в уборках",
    "slug": "bazovyi-kurs-volontera",
    "summary": "Обязательный курс перед записью на уборку: техника безопасности, правила поведения на мероприятии и как проходит уборка территории.",
    "cards": [
        ("Техника безопасности", "На уборке работайте в перчатках, не поднимайте острые и тяжёлые предметы голыми руками, держитесь группы и следуйте указаниям организатора."),
        ("Что взять с собой", "Перчатки, воду, головной убор и удобную обувь. Мешки для мусора и инвентарь обычно выдаёт организатор на месте."),
        ("Как проходит уборка", "Соберитесь в точке сбора вовремя, получите инструктаж и зону работы, а после уборки не забудьте сделать гео-чекин в приложении — так засчитывается участие и начисляются баллы."),
        ("Проверь себя", None, {"question": "Что нужно сделать после уборки, чтобы получить баллы?", "options": ["Ничего, баллы начислятся сами", "Сделать гео-чекин в приложении", "Написать письмо организатору"], "correct_index": 1}),
    ],
}

ACHIEVEMENTS = [
    {"code": "first_lesson", "title": "Первые шаги", "description": "Пройден первый урок", "icon": "📘", "criteria_type": AchievementCriteria.lessons_completed, "criteria_value": 1, "points_reward": 5, "avatar_frame_code": "bronze"},
    {"code": "all_lessons", "title": "Эко-эрудит", "description": "Пройдены все обучающие модули", "icon": "🎓", "criteria_type": AchievementCriteria.lessons_completed, "criteria_value": 4, "points_reward": 20, "avatar_frame_code": "silver"},
    {"code": "first_event", "title": "Первая уборка", "description": "Отмечено участие в первом мероприятии", "icon": "🧹", "criteria_type": AchievementCriteria.events_attended, "criteria_value": 1, "points_reward": 15, "avatar_frame_code": "bronze"},
    {"code": "five_events", "title": "Постоянный волонтёр", "description": "Отмечено участие в 5 мероприятиях", "icon": "🌊", "criteria_type": AchievementCriteria.events_attended, "criteria_value": 5, "points_reward": 40, "avatar_frame_code": "gold"},
    {"code": "first_report", "title": "Дозорный берега", "description": "Первый принятый репорт о мусоре", "icon": "📸", "criteria_type": AchievementCriteria.reports_approved, "criteria_value": 1, "points_reward": 10},
    {"code": "points_100", "title": "Сотня добрых дел", "description": "Набрано 100 баллов", "icon": "⭐", "criteria_type": AchievementCriteria.points_threshold, "criteria_value": 100, "points_reward": 10, "avatar_frame_code": "silver"},
    {"code": "points_500", "title": "Хранитель берега", "description": "Набрано 500 баллов", "icon": "🏆", "criteria_type": AchievementCriteria.points_threshold, "criteria_value": 500, "points_reward": 25, "avatar_frame_code": "emerald"},
    {"code": "summer_activist", "title": "Летний активист", "description": "3 уборки за лето", "icon": "☀️", "criteria_type": AchievementCriteria.seasonal_events_attended, "criteria_value": 3, "points_reward": 20, "season": "summer"},
]


async def _seed_sites(db) -> int:
    existing_names = set((await db.execute(select(CoastlineSite.name))).scalars().all())
    image_dir = Path(__file__).parent.parent / "static" / "satellite"
    added = 0
    for s in SITES:
        if s["name"] in existing_names:
            continue
        site = CoastlineSite(
            name=s["name"], region=s["region"], lat=s["lat"], lon=s["lon"],
            description="Демонстрационный участок побережья для показа слайдера «до/после».",
        )
        db.add(site)
        await db.flush()

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
        added += 1
    return added


async def _seed_lesson(db, lesson_data: dict, order_index: int, *, is_base_course: bool = False, points_reward: int) -> bool:
    existing = await db.execute(select(Lesson).where(Lesson.slug == lesson_data["slug"]))
    if existing.scalar_one_or_none() is not None:
        return False

    lesson = Lesson(
        title=lesson_data["title"], slug=lesson_data["slug"], summary=lesson_data["summary"],
        order_index=order_index, points_reward=points_reward, is_base_course=is_base_course,
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
    return True


async def _seed_achievements(db) -> int:
    existing_codes = set((await db.execute(select(Achievement.code))).scalars().all())
    added = 0
    for a in ACHIEVEMENTS:
        if a["code"] in existing_codes:
            continue
        db.add(Achievement(**a))
        added += 1
    return added


async def seed_content() -> None:
    async with AsyncSessionLocal() as db:
        sites_added = await _seed_sites(db)

        lessons_added = 0
        for idx, lesson_data in enumerate(LESSONS):
            if await _seed_lesson(db, lesson_data, order_index=idx, points_reward=10):
                lessons_added += 1
        if await _seed_lesson(db, BASE_COURSE, order_index=len(LESSONS), is_base_course=True, points_reward=15):
            lessons_added += 1

        achievements_added = await _seed_achievements(db)

        await db.commit()
        logger.info(
            "Content seed: %d sites, %d lessons, %d achievements added",
            sites_added, lessons_added, achievements_added,
        )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(seed_content())
