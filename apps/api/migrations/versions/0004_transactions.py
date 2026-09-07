"""transactions

Revision ID: 0004_transactions
Revises: 0003_households
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_transactions"
down_revision = "0003_households"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('transactions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('household_id', sa.UUID(), nullable=False),
    sa.Column('member_id', sa.UUID(), nullable=False),
    sa.Column('kind', postgresql.ENUM('income', 'expense', name='transaction_kind', create_type=False), nullable=False),
    sa.Column('category_id', sa.UUID(), nullable=False),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('occurred_on', sa.Date(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('source', postgresql.ENUM('manual', 'contribution', name='transaction_source', create_type=False), server_default='manual', nullable=False),
    sa.Column('source_id', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("(source = 'manual' AND source_id IS NULL) OR (source <> 'manual' AND source_id IS NOT NULL)", name='ck_transaction_source_id'),
    sa.CheckConstraint('amount_minor > 0', name='ck_transaction_amount_positive'),
    sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['member_id'], ['household_members.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_transaction_ledger', 'transactions', ['household_id', 'member_id', 'occurred_on'], unique=False)
    op.create_index('ix_transaction_totals', 'transactions', ['household_id', 'member_id', 'kind', 'occurred_on'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_transaction_totals', table_name='transactions')
    op.drop_index('ix_transaction_ledger', table_name='transactions')
    op.drop_table('transactions')
