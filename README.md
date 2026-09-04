# Чистый берег

Backend-ориентированный MVP платформы популяризации экологического мониторинга ДЗЗ
(см. [ТЗ_Чистый_берег.md](ТЗ_Чистый_берег.md)).

- **Backend:** Python, FastAPI, SQLAlchemy 2.0 (async), Alembic, PostgreSQL, JWT-аутентификация
- **Frontend:** простой multi-page vanilla HTML/CSS/JS (без сборки), Leaflet для карты, PWA-манифест
- **Деплой:** Docker Compose (PostgreSQL + backend + nginx)

## Структура проекта

```
backend/        FastAPI-приложение (app/), Alembic-миграции, тесты (pytest)
frontend/       Статические HTML/CSS/JS-страницы
nginx/          Конфиг reverse-proxy (отдаёт frontend/, проксирует /api и /static)
docker-compose.yml
.env.example    Шаблон переменных окружения — скопируйте в .env и отредактируйте
```

## Быстрый старт (локально или на VDS)

1. Установите Docker и Docker Compose (`docker compose version`).
2. Скопируйте `.env.example` в `.env` и задайте свои значения — как минимум смените
   `POSTGRES_PASSWORD` и `JWT_SECRET_KEY` на случайные строки:

   ```bash
   cp .env.example .env
   ```

3. Соберите и запустите весь стек:

   ```bash
   docker compose up -d --build
   ```

   При первом запуске backend-контейнер автоматически:
   - применит Alembic-миграции (`alembic upgrade head`),
   - засеет БД демо-данными, если `SEED_ON_STARTUP=true` в `.env` и БД пустая
     (3 участка берега со сгенерированными снимками «до/после», 4 обучающих урока,
     ачивки, 2 демо-мероприятия, три демо-аккаунта).

4. Откройте `http://<адрес-сервера>/` в браузере.

### Демо-доступы (созданы seed-скриптом)

| Роль | Email | Пароль |
|---|---|---|
| Администратор | admin@chistybereg.ru | admin12345 |
| Организатор | organizer@chistybereg.ru | organizer12345 |
| Волонтёр | volunteer@chistybereg.ru | volunteer12345 |

**Смените эти пароли или удалите демо-аккаунты перед реальным использованием.**

После первого успешного запуска на проде рекомендуется выставить `SEED_ON_STARTUP=false`
в `.env` и перезапустить `docker compose up -d`, чтобы случайный рестарт контейнера не
пытался повторно засеивать (хотя seed и так безопасно пропускает себя, если в БД уже
есть пользователи — см. `backend/app/db/seed.py`).

## HTTPS / домен

`nginx.conf` слушает только порт 80 (HTTP) — этого достаточно для локальной проверки и
для геолокации в браузере на `localhost`, но для продакшена браузеры требуют HTTPS для
`navigator.geolocation` на внешних доменах. На VDS проще всего добавить перед этим стеком
отдельный реверс-прокси с автоматическим TLS (например, Caddy или nginx + certbot) и
проксировать его на `127.0.0.1:80` этого docker-compose, либо вписать сертификаты прямо
в `nginx/nginx.conf` и открыть порт 443 в `docker-compose.yml`.

## Разработка

### Backend без Docker

```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt
alembic upgrade head
python -m app.db.seed   # опционально
uvicorn app.main:app --reload
```

По умолчанию (без `DATABASE_URL` в окружении) используется локальный SQLite-файл — этого
достаточно для разработки API без Postgres.

### Тесты

```bash
docker compose run --rm --entrypoint pytest backend -v
```

Тесты используют in-memory SQLite и не трогают вашу основную БД. Покрыты ключевые
сценарии: регистрация/логин/refresh, прохождение урока с начислением баллов и ачивок,
регистрация и гео-чекин на мероприятие (включая отказ при удалённом гео-чекине),
отправка и модерация репортов о мусоре, сортировка лидерборда.

### Миграции

```bash
docker compose run --rm --entrypoint alembic -v "$(pwd)/backend/alembic/versions:/app/alembic/versions" backend revision --autogenerate -m "описание изменений"
docker compose restart backend   # применит новую миграцию через entrypoint.sh
```

### Frontend отдельно (без backend)

```bash
cd frontend
npm install
npm run dev   # статика на http://localhost:5173, но API-запросы будут падать без backend/nginx
```

Полноценная работа фронтенда (относительные пути `/api/...`) рассчитана на запуск через
nginx из `docker-compose.yml`, который проксирует API на тот же origin.

## Данные ДЗЗ

Реального доступа к API «СР Дата» / Sentinel Hub на момент разработки не было, поэтому
согласно рекомендации ТЗ (п. 8, 11) используется статичный демо-датасет: скрипт
`backend/app/db/seed_images.py` генерирует стилизованные снимки «до/после» для трёх
участков берега при первом запуске. Структура данных (`CoastlineSite` → `SatelliteLayer`
с полями `image_url`, `bounds`, `captured_at`) рассчитана на то, чтобы позже заменить
сгенерированные картинки на реальные тайлы/снимки через админский API
(`POST /api/v1/sites`, `POST /api/v1/sites/{id}/layers`) без изменения фронтенда.

## API

Полная интерактивная документация (Swagger UI) доступна на `/docs`, ReDoc — на `/redoc`.
