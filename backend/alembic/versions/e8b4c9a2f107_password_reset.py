"""password_reset: purpose column on email_verification_codes

Разделяет коды подтверждения по назначению ("verify" — регистрация/смена email,
"password_reset" — восстановление пароля через "Забыли пароль?"), чтобы код одного
сценария нельзя было использовать в другом (см. app/services/verification.py).

Revision ID: e8b4c9a2f107
Revises: d291f6c8a4b3
Create Date: 2026-09-05 12:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e8b4c9a2f107'
down_revision = 'd291f6c8a4b3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'email_verification_codes',
        sa.Column('purpose', sa.String(length=30), nullable=False, server_default='verify'),
    )
    op.alter_column('email_verification_codes', 'purpose', server_default=None)


def downgrade() -> None:
    op.drop_column('email_verification_codes', 'purpose')
