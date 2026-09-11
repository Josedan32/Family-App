"""debts

Revision ID: 0006_debts
Revises: 0005_savings
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006_debts"
down_revision = "0005_savings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('debts',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('household_id', sa.UUID(), nullable=False),
    sa.Column('member_id', sa.UUID(), nullable=False),
    sa.Column('creditor_type', postgresql.ENUM('bank', 'family', 'credit_card', 'addi', 'other', name='debt_creditor_type', create_type=False), nullable=False),
    sa.Column('creditor_label', sa.String(length=120), nullable=False),
    sa.Column('principal_minor', sa.BigInteger(), nullable=False),
    sa.Column('annual_interest_rate', sa.Numeric(precision=5, scale=2), nullable=True),
    sa.Column('due_day', sa.SmallInteger(), nullable=True),
    sa.Column('status', postgresql.ENUM('active', 'paid', 'cancelled', name='debt_status', create_type=False), server_default='active', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('due_day IS NULL OR (due_day BETWEEN 1 AND 31)', name='ck_debt_due_day'),
    sa.CheckConstraint('principal_minor > 0', name='ck_debt_principal_positive'),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['member_id'], ['household_members.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('debt_payments',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('household_id', sa.UUID(), nullable=False),
    sa.Column('debt_id', sa.UUID(), nullable=False),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('paid_on', sa.Date(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('amount_minor > 0', name='ck_debt_payment_positive'),
    sa.ForeignKeyConstraint(['debt_id'], ['debts.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_debt_payment_debt', 'debt_payments', ['debt_id', 'paid_on'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_debt_payment_debt', table_name='debt_payments')
    op.drop_table('debt_payments')
    op.drop_table('debts')
