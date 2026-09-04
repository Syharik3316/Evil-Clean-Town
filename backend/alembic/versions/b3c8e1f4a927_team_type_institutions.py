"""team_type_institutions: add university/college to teamtype enum

Не влияет на SQLite (используется только в dev/тестах через create_all, не через
Alembic) — актуально только для реального Postgres-деплоя. Нужно для раздела
"Моя команда/школа" в профиле волонтёра, куда добавляется справочник школ/вузов/
колледжей (см. app/db/seed_institutions.py).

Revision ID: b3c8e1f4a927
Revises: a9c4e7f2b615
Create Date: 2026-09-05 00:00:02.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'b3c8e1f4a927'
down_revision = 'a9c4e7f2b615'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("ALTER TYPE teamtype ADD VALUE IF NOT EXISTS 'university'")
    op.execute("ALTER TYPE teamtype ADD VALUE IF NOT EXISTS 'college'")


def downgrade() -> None:
    # PostgreSQL не поддерживает удаление значений enum — откат не выполняется,
    # лишние значения типа безвредны при отсутствии использующих их строк.
    pass
