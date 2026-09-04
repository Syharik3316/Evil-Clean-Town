"""events v2: roles, applicant statuses, site-linked cleanups, report.event_id

Revision ID: c2d8e4f19a03
Revises: 7f3c9a21b6d4
Create Date: 2026-09-04 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c2d8e4f19a03'
down_revision = '7f3c9a21b6d4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Расширяем существующие Postgres-enum типы новыми значениями (только добавление —
    # старое значение 'registered' у registrationstatus оставляем в типе неиспользуемым,
    # чтобы не городить пересоздание типа ради переименования на пустой/демо-БД).
    # Postgres запрещает использовать новое значение enum в той же транзакции, где оно
    # добавлено ("unsafe use of new value") — выполняем ADD VALUE в autocommit-блоке,
    # чтобы они закоммитились до UPDATE ниже, использующего значение 'pending'.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE eventstatus ADD VALUE IF NOT EXISTS 'pending_review'")
        op.execute("ALTER TYPE eventstatus ADD VALUE IF NOT EXISTS 'rejected'")
        op.execute("ALTER TYPE registrationstatus ADD VALUE IF NOT EXISTS 'pending'")
        op.execute("ALTER TYPE registrationstatus ADD VALUE IF NOT EXISTS 'approved'")
        op.execute("ALTER TYPE registrationstatus ADD VALUE IF NOT EXISTS 'rejected'")

    op.add_column('events', sa.Column('region', sa.String(length=200), nullable=True))
    op.add_column('events', sa.Column('applications_closed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('events', sa.Column('prerequisite_lesson_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_events_prerequisite_lesson_id', 'events', 'lessons', ['prerequisite_lesson_id'], ['id']
    )

    op.create_table(
        'event_roles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('capacity', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.add_column('event_registrations', sa.Column('role_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_event_registrations_role_id', 'event_registrations', 'event_roles', ['role_id'], ['id']
    )
    op.add_column('event_registrations', sa.Column('rejection_reason', sa.Text(), nullable=True))
    op.add_column(
        'event_registrations',
        sa.Column('is_featured', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column('event_registrations', sa.Column('special_note', sa.String(length=300), nullable=True))
    op.alter_column('event_registrations', 'is_featured', server_default=None)

    op.execute("UPDATE event_registrations SET status = 'pending' WHERE status = 'registered'")

    op.add_column('trash_reports', sa.Column('event_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_trash_reports_event_id', 'trash_reports', 'events', ['event_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_trash_reports_event_id', 'trash_reports', type_='foreignkey')
    op.drop_column('trash_reports', 'event_id')

    op.drop_column('event_registrations', 'special_note')
    op.drop_column('event_registrations', 'is_featured')
    op.drop_column('event_registrations', 'rejection_reason')
    op.drop_constraint('fk_event_registrations_role_id', 'event_registrations', type_='foreignkey')
    op.drop_column('event_registrations', 'role_id')

    op.drop_table('event_roles')

    op.drop_constraint('fk_events_prerequisite_lesson_id', 'events', type_='foreignkey')
    op.drop_column('events', 'prerequisite_lesson_id')
    op.drop_column('events', 'applications_closed_at')
    op.drop_column('events', 'region')

    # Postgres не поддерживает удаление значений enum — новые значения остаются в типе.
