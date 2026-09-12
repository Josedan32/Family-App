"""Add optional installment plan columns to debts.

Revision ID: 0009_debt_installments
Revises: 0008_contributions
"""

import sqlalchemy as sa
from alembic import op

revision = "0009_debt_installments"
down_revision = "0008_contributions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("debts", sa.Column("installments_total", sa.SmallInteger(), nullable=True))
    op.add_column(
        "debts", sa.Column("installment_amount_minor", sa.BigInteger(), nullable=True)
    )
    op.add_column("debts", sa.Column("first_installment_on", sa.Date(), nullable=True))
    op.create_check_constraint(
        "ck_debt_installment_plan_complete",
        "debts",
        "installments_total IS NULL AND installment_amount_minor IS NULL "
        "AND first_installment_on IS NULL "
        "OR installments_total IS NOT NULL AND installment_amount_minor IS NOT NULL "
        "AND first_installment_on IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_debt_installments_positive", "debts",
        "installments_total IS NULL OR installments_total > 0",
    )
    op.create_check_constraint(
        "ck_debt_installment_amount_positive", "debts",
        "installment_amount_minor IS NULL OR installment_amount_minor > 0",
    )


def downgrade() -> None:
    op.drop_constraint("ck_debt_installment_amount_positive", "debts", type_="check")
    op.drop_constraint("ck_debt_installments_positive", "debts", type_="check")
    op.drop_constraint("ck_debt_installment_plan_complete", "debts", type_="check")
    op.drop_column("debts", "first_installment_on")
    op.drop_column("debts", "installment_amount_minor")
    op.drop_column("debts", "installments_total")
