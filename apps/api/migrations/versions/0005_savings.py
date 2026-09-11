"""savings

Revision ID: 0005_savings
Revises: 0004_transactions
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_savings"
down_revision = "0004_transactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('savings_goals',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('household_id', sa.UUID(), nullable=False),
    sa.Column('member_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('target_amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('target_date', sa.Date(), nullable=True),
    sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('target_amount_minor > 0', name='ck_goal_target_positive'),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['member_id'], ['household_members.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('savings_entries',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('household_id', sa.UUID(), nullable=False),
    sa.Column('goal_id', sa.UUID(), nullable=False),
    sa.Column('kind', postgresql.ENUM('deposit', 'withdrawal', name='savings_entry_kind', create_type=False), nullable=False),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('occurred_on', sa.Date(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('amount_minor > 0', name='ck_savings_entry_positive'),
    sa.ForeignKeyConstraint(['goal_id'], ['savings_goals.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_savings_entry_goal', 'savings_entries', ['goal_id', 'occurred_on'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_savings_entry_goal', table_name='savings_entries')
    op.drop_table('savings_entries')
    op.drop_table('savings_goals')
