"""org_approval_bio_avatars

Revision ID: 8eb626abc523
Revises: b3c8e1f4a927
Create Date: 2026-09-05 00:00:00

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '8eb626abc523'
down_revision = 'b3c8e1f4a927'
branch_labels = None
depends_on = None

org_status_enum = sa.Enum('pending', 'approved', 'rejected', name='organizationstatus')


def upgrade() -> None:
    bind = op.get_bind()
    org_status_enum.create(bind, checkfirst=True)

    op.add_column(
        'organizations',
        sa.Column('status', org_status_enum, nullable=False, server_default='pending'),
    )
    # организации, уже работавшие до введения модерации, не должны внезапно потерять доступ
    op.execute("UPDATE organizations SET status = 'approved'")
    op.alter_column('organizations', 'status', server_default=None)
    op.add_column('organizations', sa.Column('rejection_reason', sa.String(length=1000), nullable=True))
    op.add_column('organizations', sa.Column('bio', sa.String(length=2000), nullable=True))

    op.add_column('users', sa.Column('bio', sa.String(length=2000), nullable=True))
    op.add_column('users', sa.Column('pending_email', sa.String(length=255), nullable=True))

    op.add_column('achievements', sa.Column('image_url', sa.String(length=500), nullable=True))
    op.add_column('achievements', sa.Column('avatar_frame_image_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('achievements', 'avatar_frame_image_url')
    op.drop_column('achievements', 'image_url')

    op.drop_column('users', 'pending_email')
    op.drop_column('users', 'bio')

    op.drop_column('organizations', 'bio')
    op.drop_column('organizations', 'rejection_reason')
    op.drop_column('organizations', 'status')

    bind = op.get_bind()
    org_status_enum.drop(bind, checkfirst=True)
