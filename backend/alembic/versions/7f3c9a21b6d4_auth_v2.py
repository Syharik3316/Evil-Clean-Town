"""auth v2: username, email/age verification, organizations, login events

Revision ID: 7f3c9a21b6d4
Revises: 99d6ab27f54c
Create Date: 2026-09-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7f3c9a21b6d4'
down_revision = '99d6ab27f54c'
branch_labels = None
depends_on = None


age_verification_method_enum = sa.Enum('none', 'gosuslugi', 'manual', name='ageverificationmethod')
organization_legal_type_enum = sa.Enum('legal_entity', 'individual_entrepreneur', name='organizationlegaltype')


def upgrade() -> None:
    bind = op.get_bind()
    # age_verification_method — используется через add_column (ALTER TABLE), которая, в отличие
    # от create_table, не создаёт enum-тип автоматически, поэтому создаём его явно.
    # organizationlegaltype используется в create_table('organizations', ...) ниже — тот сам
    # создаст свой enum-тип, повторный .create() здесь привёл бы к "already exists".
    age_verification_method_enum.create(bind, checkfirst=True)

    op.create_table(
        'organizations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=300), nullable=False),
        sa.Column('inn', sa.String(length=12), nullable=False),
        sa.Column('legal_type', organization_legal_type_enum, nullable=False),
        sa.Column('contact_email', sa.String(length=255), nullable=False),
        sa.Column('points_total', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('inn'),
    )
    op.create_index(op.f('ix_organizations_inn'), 'organizations', ['inn'], unique=True)

    op.create_table(
        'email_verification_codes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('code_hash', sa.String(length=255), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'manual_verification_submissions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('full_name', sa.String(length=300), nullable=False),
        sa.Column('birth_date', sa.Date(), nullable=False),
        sa.Column('passport_series', sa.String(length=20), nullable=False),
        sa.Column('passport_number', sa.String(length=20), nullable=False),
        sa.Column('issued_by', sa.String(length=300), nullable=False),
        sa.Column('issued_date', sa.Date(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'login_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.add_column('users', sa.Column('username', sa.String(length=100), nullable=True))
    # Бэкофилл на случай, если в БД уже есть строки (например, демо-сид) — гарантированно
    # уникальный логин из префикса email + id, дальше пользователь может сменить в профиле.
    op.execute("UPDATE users SET username = split_part(email, '@', 1) || id::text WHERE username IS NULL")
    op.alter_column('users', 'username', nullable=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    op.add_column('users', sa.Column('region', sa.String(length=200), nullable=True))
    op.add_column(
        'users', sa.Column('email_verified', sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.add_column(
        'users', sa.Column('age_verified', sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.add_column(
        'users',
        sa.Column(
            'age_verification_method', age_verification_method_enum, nullable=False, server_default='none'
        ),
    )
    op.add_column(
        'users', sa.Column('dobro_ru_linked', sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.add_column(
        'users', sa.Column('dvizhenie_pervyh_linked', sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.add_column('users', sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        'users', sa.Column('current_streak', sa.Integer(), nullable=False, server_default='0')
    )
    op.add_column(
        'users', sa.Column('longest_streak', sa.Integer(), nullable=False, server_default='0')
    )
    op.add_column('users', sa.Column('selected_avatar_frame', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('organization_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_users_organization_id', 'users', 'organizations', ['organization_id'], ['id']
    )

    for column in (
        'email_verified', 'age_verified', 'dobro_ru_linked', 'dvizhenie_pervyh_linked',
        'current_streak', 'longest_streak',
    ):
        op.alter_column('users', column, server_default=None)
    op.alter_column('users', 'age_verification_method', server_default=None)


def downgrade() -> None:
    op.drop_constraint('fk_users_organization_id', 'users', type_='foreignkey')
    for column in (
        'organization_id', 'selected_avatar_frame', 'longest_streak', 'current_streak',
        'last_login_at', 'dvizhenie_pervyh_linked', 'dobro_ru_linked', 'age_verification_method',
        'age_verified', 'email_verified', 'region',
    ):
        op.drop_column('users', column)
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_column('users', 'username')

    op.drop_table('login_events')
    op.drop_table('manual_verification_submissions')
    op.drop_table('email_verification_codes')
    op.drop_index(op.f('ix_organizations_inn'), table_name='organizations')
    op.drop_table('organizations')

    bind = op.get_bind()
    organization_legal_type_enum.drop(bind, checkfirst=True)
    age_verification_method_enum.drop(bind, checkfirst=True)
