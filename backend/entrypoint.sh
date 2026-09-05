#!/bin/sh
set -e

alembic upgrade head

# Справочник учреждений (школы/вузы/колледжи), единственный администратор из .env и
# справочный контент (участки побережья, курсы, ачивки) — не демо-данные, безопасно и
# дёшево запускать всегда, идемпотентно.
python -m app.db.seed_institutions
python -m app.db.seed_admin
python -m app.db.seed_content

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
