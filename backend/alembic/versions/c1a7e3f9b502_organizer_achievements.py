"""organizer_achievements: audience field + organizer criteria types

Добавляет ачивки для организаторов (создать мероприятие, провести мероприятие,
набрать волонтёров на мероприятие, создать курс, курс прошли N волонтёров) —
используют ту же инфраструктуру achievements/user_achievements, что и у волонтёров,
но фильтруются по новому полю audience.

Revision ID: c1a7e3f9b502
Revises: e8b4c9a2f107
Create Date: 2026-09-05 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c1a7e3f9b502'
down_revision = 'e8b4c9a2f107'
branch_labels = None
depends_on = None

achievement_audience_enum = sa.Enum('volunteer', 'organizer', name='achievementaudience')


def upgrade() -> None:
    bind = op.get_bind()
    achievement_audience_enum.create(bind, checkfirst=True)

    op.add_column(
        'achievements',
        sa.Column('audience', achievement_audience_enum, nullable=False, server_default='volunteer'),
    )
    op.alter_column('achievements', 'audience', server_default=None)

    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE achievementcriteria ADD VALUE IF NOT EXISTS 'events_created'")
        op.execute("ALTER TYPE achievementcriteria ADD VALUE IF NOT EXISTS 'events_completed'")
        op.execute("ALTER TYPE achievementcriteria ADD VALUE IF NOT EXISTS 'event_volunteers_registered'")
        op.execute("ALTER TYPE achievementcriteria ADD VALUE IF NOT EXISTS 'courses_created'")
        op.execute("ALTER TYPE achievementcriteria ADD VALUE IF NOT EXISTS 'course_completions'")


def downgrade() -> None:
    op.drop_column('achievements', 'audience')
    bind = op.get_bind()
    achievement_audience_enum.drop(bind, checkfirst=True)
    # Postgres не поддерживает удаление значений enum — новые значения achievementcriteria остаются в типе.
