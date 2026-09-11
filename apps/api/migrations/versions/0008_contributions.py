"""contributions

Revision ID: 0008_contributions
Revises: 0007_member_loans
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008_contributions"
down_revision = "0007_member_loans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('contribution_periods',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('household_id', sa.UUID(), nullable=False),
    sa.Column('period_month', sa.Date(), nullable=False),
    sa.Column('goal_amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('status', postgresql.ENUM('open', 'closed', name='period_status', create_type=False), server_default='open', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('EXTRACT(DAY FROM period_month) = 1', name='ck_period_month_is_first'),
    sa.CheckConstraint('goal_amount_minor > 0', name='ck_period_goal_positive'),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('household_id', 'period_month', name='uq_period_household_month')
    )
    op.create_table('contribution_pledges',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('household_id', sa.UUID(), nullable=False),
    sa.Column('period_id', sa.UUID(), nullable=False),
    sa.Column('member_id', sa.UUID(), nullable=False),
    sa.Column('expected_amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('expected_amount_minor > 0', name='ck_pledge_positive'),
    sa.ForeignKeyConstraint(['member_id'], ['household_members.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['period_id'], ['contribution_periods.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('period_id', 'member_id', name='uq_pledge_period_member')
    )
    op.create_table('contributions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('household_id', sa.UUID(), nullable=False),
    sa.Column('period_id', sa.UUID(), nullable=False),
    sa.Column('member_id', sa.UUID(), nullable=False),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('paid_on', sa.Date(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('expense_transaction_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('amount_minor > 0', name='ck_contribution_positive'),
    sa.ForeignKeyConstraint(['expense_transaction_id'], ['transactions.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['member_id'], ['household_members.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['period_id'], ['contribution_periods.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('expense_transaction_id')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('contributions')
    op.drop_table('contribution_pledges')
    op.drop_table('contribution_periods')
