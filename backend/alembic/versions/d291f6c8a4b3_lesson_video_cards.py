"""lesson_video_cards: add 'video' to cardcontenttype enum + video_url on lesson_cards

Нужно для видеокурсов организаторов/админа: карточка урока может ссылаться на видео
по прямому URL, проигрываемое анти-скип плеером (см. frontend/js/lessons.js) —
итоговый тест открывается только после полного просмотра.

Revision ID: d291f6c8a4b3
Revises: 8eb626abc523
Create Date: 2026-09-05 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd291f6c8a4b3'
down_revision = '8eb626abc523'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE cardcontenttype ADD VALUE IF NOT EXISTS 'video'")
    op.add_column('lesson_cards', sa.Column('video_url', sa.String(length=2048), nullable=True))


def downgrade() -> None:
    op.drop_column('lesson_cards', 'video_url')
    # PostgreSQL не поддерживает удаление значений enum — откат не выполняется
    # (лишнее значение типа безвредно при отсутствии карточек, которые его используют).
