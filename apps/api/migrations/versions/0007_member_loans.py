"""member loans

Revision ID: 0007_member_loans
Revises: 0006_debts
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007_member_loans"
down_revision = "0006_debts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('member_loans',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('household_id', sa.UUID(), nullable=False),
    sa.Column('lender_member_id', sa.UUID(), nullable=False),
    sa.Column('borrower_member_id', sa.UUID(), nullable=False),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('lent_on', sa.Date(), nullable=False),
    sa.Column('due_on', sa.Date(), nullable=True),
    sa.Column('status', postgresql.ENUM('pending', 'partially_paid', 'paid', 'cancelled', name='loan_status', create_type=False), server_default='pending', nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('amount_minor > 0', name='ck_loan_amount_positive'),
    sa.CheckConstraint('lender_member_id <> borrower_member_id', name='ck_loan_distinct_parties'),
    sa.ForeignKeyConstraint(['borrower_member_id'], ['household_members.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['lender_member_id'], ['household_members.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_loan_borrower', 'member_loans', ['household_id', 'borrower_member_id'], unique=False)
    op.create_index('ix_loan_lender', 'member_loans', ['household_id', 'lender_member_id'], unique=False)
    op.create_table('member_loan_payments',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('household_id', sa.UUID(), nullable=False),
    sa.Column('loan_id', sa.UUID(), nullable=False),
    sa.Column('amount_minor', sa.BigInteger(), nullable=False),
    sa.Column('paid_on', sa.Date(), nullable=False),
    sa.Column('recorded_by_member_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('amount_minor > 0', name='ck_loan_payment_positive'),
    sa.ForeignKeyConstraint(['loan_id'], ['member_loans.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['recorded_by_member_id'], ['household_members.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_loan_payment_loan', 'member_loan_payments', ['loan_id', 'paid_on'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_loan_payment_loan', table_name='member_loan_payments')
    op.drop_table('member_loan_payments')
    op.drop_index('ix_loan_lender', table_name='member_loans')
    op.drop_index('ix_loan_borrower', table_name='member_loans')
    op.drop_table('member_loans')
