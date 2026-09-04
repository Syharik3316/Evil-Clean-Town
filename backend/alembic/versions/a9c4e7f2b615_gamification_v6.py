"""gamification v6: seasonal achievements, avatar frames

Revision ID: a9c4e7f2b615
Revises: f7b3d0c9e412
Create Date: 2026-09-05 00:00:03.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a9c4e7f2b615'
down_revision = 'f7b3d0c9e412'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE achievementcriteria ADD VALUE IF NOT EXISTS 'seasonal_events_attended'")

    op.add_column('achievements', sa.Column('season', sa.String(length=20), nullable=True))
    op.add_column('achievements', sa.Column('avatar_frame_code', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('achievements', 'avatar_frame_code')
    op.drop_column('achievements', 'season')
    # Postgres не поддерживает удаление значений enum — новое значение остаётся в типе.
