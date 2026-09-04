"""grafana_reader: read-only Postgres role for Grafana dashboards

Не влияет на SQLite (используется только в dev/тестах через create_all, не через
Alembic) — актуально только для реального Postgres-деплоя из docker-compose.yml.

Revision ID: e5f2a9c31d08
Revises: d4a1f6b8c2e7
Create Date: 2026-09-05 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa

from app.core.config import settings

# revision identifiers, used by Alembic.
revision = 'e5f2a9c31d08'
down_revision = 'd4a1f6b8c2e7'
branch_labels = None
depends_on = None

ROLE = "grafana_reader"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    password = settings.grafana_db_password.replace("'", "''")
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{ROLE}') THEN
                CREATE ROLE {ROLE} LOGIN PASSWORD '{password}';
            ELSE
                ALTER ROLE {ROLE} LOGIN PASSWORD '{password}';
            END IF;
        END
        $$;
        """
    )
    op.execute(f"GRANT CONNECT ON DATABASE {bind.engine.url.database} TO {ROLE}")
    op.execute(f"GRANT USAGE ON SCHEMA public TO {ROLE}")
    op.execute(f"GRANT SELECT ON ALL TABLES IN SCHEMA public TO {ROLE}")
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO {ROLE}")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute(f"REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM {ROLE}")
    op.execute(f"DROP ROLE IF EXISTS {ROLE}")
