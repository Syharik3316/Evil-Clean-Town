#!/bin/sh
set -e

alembic upgrade head

# Справочник учреждений (школы/вузы/колледжи) — не демо-данные, безопасно и дёшево
# запускать всегда, независимо от SEED_ON_STARTUP (идемпотентно по имени).
python -m app.db.seed_institutions

if [ "$SEED_ON_STARTUP" = "true" ]; then
  python -m app.db.seed
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
