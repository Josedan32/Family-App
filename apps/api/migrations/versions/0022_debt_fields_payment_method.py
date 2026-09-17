"""Debt name/minimum payment, and payment method on debt payments.

Adds `debts.name` (free-text, distinct from `creditor_label`) and
`debts.minimum_payment_minor` (a monthly figure for debts that have no
installment plan). Adds `debt_payments.payment_method`, reusing the
`transaction_payment_method` enum Task 6 created rather than defining a
second enum type for the same three values (Task 14).

Revision ID: 0022_debt_fields_payment_method
Revises: 0021_savings_priority
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0022_debt_fields_payment_method"
down_revision = "0021_savings_priority"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("debts", sa.Column("name", sa.String(length=120), nullable=True))
    op.execute("UPDATE debts SET name = creditor_label WHERE name IS NULL")
    op.alter_column("debts", "name", nullable=False)

    op.add_column(
        "debts", sa.Column("minimum_payment_minor", sa.BigInteger(), nullable=True)
    )
    op.create_check_constraint(
        "ck_debt_minimum_payment_positive",
        "debts",
        "minimum_payment_minor IS NULL OR minimum_payment_minor > 0",
    )

    op.add_column(
        "debt_payments",
        sa.Column(
            "payment_method",
            postgresql.ENUM(name="transaction_payment_method", create_type=False),
            nullable=False,
            server_default="cash",
        ),
    )


def downgrade() -> None:
    op.drop_column("debt_payments", "payment_method")
    op.drop_constraint("ck_debt_minimum_payment_positive", "debts", type_="check")
    op.drop_column("debts", "minimum_payment_minor")
    op.drop_column("debts", "name")
