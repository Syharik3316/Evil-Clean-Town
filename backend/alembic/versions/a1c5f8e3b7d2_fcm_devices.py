"""fcm_devices: Firebase Cloud Messaging tokens for the Android app

Revision ID: a1c5f8e3b7d2
Revises: d8a2f5c1e934
Create Date: 2026-09-05 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1c5f8e3b7d2'
down_revision = 'd8a2f5c1e934'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'fcm_devices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=500), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token'),
    )


def downgrade() -> None:
    op.drop_table('fcm_devices')
