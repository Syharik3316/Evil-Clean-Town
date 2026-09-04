# Архитектура «Чистый берег»

Актуально на: раздел 1–6 нового ТЗ (auth v2 → gamification v6, Alembic-миграции
`99d6ab27f54c` … `a9c4e7f2b615`). Обновляйте этот файл при значимых архитектурных
изменениях (см. `Инструкции.md`).

## Компоненты (docker-compose.yml)

```mermaid
flowchart LR
    Browser["Браузер / PWA"] -->|HTTP :80| Nginx
    Nginx -->|"/api/*, /static/*, /docs"| Backend["FastAPI (uvicorn :8000)"]
    Nginx -->|"static frontend/*.html"| Browser
    Nginx -->|"/uploads/* (alias, минуя backend)"| UploadsVol[(uploads volume)]
    Backend --> DB[(PostgreSQL :5432)]
    Backend --> UploadsVol
    Grafana["Grafana :3000"] -->|"SELECT-only, роль grafana_reader"| DB
    Backend -->|SMTP, если настроен| MailServer[(внешний SMTP)]
```

- **backend**: единственный сервис с бизнес-логикой; на старте (`entrypoint.sh`) прогоняет
  `alembic upgrade head`, затем сидирует БД (`app/db/seed.py`), затем поднимает uvicorn.
- **nginx**: единственная точка входа снаружи (порт 80). Раздаёт `frontend/` как статику,
  проксирует `/api/`, `/static/`, `/docs|/redoc|/openapi.json` на backend, отдаёт
  `/uploads/` напрямую с диска (без похода в backend).
- **grafana**: отдельный порт (3000, не через nginx). Ходит в ту же Postgres-БД под
  read-only ролью `grafana_reader` (создаётся миграцией `e5f2a9c31d08`), датасорс и
  дашборд провизионируются из `grafana/provisioning/`.
- **db**: Postgres 16. В dev/тестах backend вместо неё может работать на SQLite
  (`DATABASE_URL` не задан) — тесты используют in-memory SQLite напрямую через
  `Base.metadata.create_all`, миграции Alembic в тестах не участвуют.

## Backend: слои

```
app/api/v1/*        FastAPI-роутеры (по одному на домен: auth, users, events,
                     admin_tickets, notifications, lessons, reports, sites, gamification, admin)
app/schemas/*        Pydantic-модели запросов/ответов (1:1 с моделями в app/models)
app/services/*        Бизнес-логика, переиспользуемая между роутерами:
                     gamification.py  — award_points/check_achievements/update_streak
                                        (единственное место, где меняются points_total,
                                        включая начисление очков организации-организатору)
                     notifications.py — notify() — единственная точка создания Notification
                     verification.py  — email-код подтверждения (генерация/проверка)
                     email.py         — отправка письма через aiosmtplib (no-op + лог, если SMTP не настроен)
                     gosuslugi.py     — ЗАГЛУШКА интеграции с ЕСИА (is_configured()==False всегда,
                                        пока не заданы GOSUSLUGI_* в .env)
                     inn.py           — проверка контрольной суммы ИНН (10/12 цифр)
app/models/*          SQLAlchemy 2.0 ORM-модели (Mapped[...]), сгруппированы по файлам-доменам
app/core/{config,deps,security}.py   настройки (.env), FastAPI-зависимости (auth/роли), JWT/bcrypt
```

Паттерн ролевого доступа: `require_roles(*roles)` в `app/core/deps.py` — фабрика
FastAPI-зависимостей. Для сущностей с владельцем (мероприятия, курсы) используется
дополнительная ручная проверка `_ensure_*_owner(entity, user)` (владелец ИЛИ admin), а не
отдельная роль — это позволяет волонтёру, предложившему мероприятие, управлять именно им.

## Данные: сквозные жизненные циклы

**Мероприятие** (`Event.status`): `pending_review` (по умолчанию при создании, автором
может быть волонтёр или организатор, не admin) → `published` (одобрено админом в
`/admin/tickets/events/{id}/approve` или `edit-approve`) | `rejected` (с обязательной
причиной → уведомление автору). Для `event_type=cleanup` обязателен `site_id`
(привязка к `CoastlineSite` — центральная связь с ДЗЗ-историей продукта).

**Заявка на мероприятие** (`EventRegistration.status`): `pending` (при подаче) →
`approved`/`rejected` (решение организатора-владельца, reject требует причины) →
`checked_in` (гео-чекин участника, доступен только из `approved`; начисляет баллы,
обновляет `update_streak`, будущей организации-владельцу события — если есть).

**Курс** (`Lesson.status`): `draft` (создан organizer/admin) → `pending_review`
(`POST /lessons/{id}/submit`) → `published` (тикет `/admin/tickets/courses/{id}/approve`
или `edit-approve`) | `rejected`. Admin-созданные курсы публикуются сразу. Ровно один
курс в системе может иметь `is_base_course=True` (`POST /lessons/{id}/set-base-course`,
admin-only) — его прохождение обязательно перед подачей заявки на `cleanup`-мероприятие
(вместе с `age_verified`). Мероприятие может дополнительно требовать конкретный
опубликованный курс через `Event.prerequisite_lesson_id`
(`POST /events/{id}/attach-course`).

**Тикеты админа** (`app/api/v1/admin_tickets.py`) — единая точка модерации для трёх типов
контента (репорты используют более старый `POST /reports/{id}/moderate`, тоже с
обязательной причиной на отказ через `ModerationRequest`-валидатор): approve / reject
(причина обязательна, уходит через `notify()`) / edit-approve (только для мероприятий и
курсов — правки применяются, затем публикация).

## Frontend

Multi-page vanilla JS (без сборки), один `js/api.js` на все страницы (JWT в localStorage,
авто-refresh при 401). Разделение по роли — не через отдельные origin/сборки, а через
`js/nav.js`, который рендерит разные пункты меню и данные по `currentUser().role`; сами
страницы (`organizer.html`, `tickets.html`, `admin.html`) сами проверяют роль при загрузке
и показывают ошибку доступа не-авторизованным ролям (защита на бэкенде обязательна и
первична — фронтовая проверка только для UX).

Учитывайте будущую сборку в Capacitor (см. `Инструкции.md`): страницы должны оставаться
относительными путями (`/api/v1/...` через тот же origin, что и сейчас), без хардкода
`localhost`/порта — уже соблюдается везде в `js/*.js`.
