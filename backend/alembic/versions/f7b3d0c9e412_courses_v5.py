"""courses v5: lesson status/authoring, base course flag

Revision ID: f7b3d0c9e412
Revises: e5f2a9c31d08
Create Date: 2026-09-05 00:00:02.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f7b3d0c9e412'
down_revision = 'e5f2a9c31d08'
branch_labels = None
depends_on = None

lesson_status_enum = sa.Enum('draft', 'pending_review', 'published', 'rejected', name='lessonstatus')


def upgrade() -> None:
    bind = op.get_bind()
    lesson_status_enum.create(bind, checkfirst=True)

    op.add_column(
        'lessons',
        sa.Column('status', lesson_status_enum, nullable=False, server_default='published'),
    )
    op.execute("UPDATE lessons SET status = 'draft' WHERE published = false")
    op.alter_column('lessons', 'status', server_default=None)
    op.drop_column('lessons', 'published')

    op.add_column(
        'lessons', sa.Column('is_base_course', sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.alter_column('lessons', 'is_base_course', server_default=None)
    op.add_column('lessons', sa.Column('created_by_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_lessons_created_by_id', 'lessons', 'users', ['created_by_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_lessons_created_by_id', 'lessons', type_='foreignkey')
    op.drop_column('lessons', 'created_by_id')
    op.drop_column('lessons', 'is_base_course')

    op.add_column('lessons', sa.Column('published', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.execute("UPDATE lessons SET published = (status = 'published')")
    op.alter_column('lessons', 'published', server_default=None)
    op.drop_column('lessons', 'status')

    bind = op.get_bind()
    lesson_status_enum.drop(bind, checkfirst=True)
