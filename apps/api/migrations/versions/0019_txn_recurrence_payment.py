"""Recurrence and payment method on transactions.

Adds transaction_frequency/transaction_payment_method enums, plus
is_recurring, frequency and payment_method columns to transactions
(Task 6). Existing rows default to non-recurring, cash payments.

Revision ID: 0019_txn_recurrence_payment
Revises: 0018_chore_cycle_views
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0019_txn_recurrence_payment"
down_revision = "0018_chore_cycle_views"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE transaction_frequency AS ENUM ('monthly', 'once', 'biweekly')")
    op.execute(
        "CREATE TYPE transaction_payment_method AS ENUM ('cash', 'nequi', 'bancolombia')"
    )

    op.add_column(
        "transactions",
        sa.Column("is_recurring", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "transactions",
        sa.Column(
            "frequency",
            postgresql.ENUM(name="transaction_frequency", create_type=False),
            nullable=True,
        ),
    )
    op.add_column(
        "transactions",
        sa.Column(
            "payment_method",
            postgresql.ENUM(name="transaction_payment_method", create_type=False),
            nullable=False,
            server_default="cash",
        ),
    )
    op.create_check_constraint(
        "ck_transaction_recurring_frequency",
        "transactions",
        "(is_recurring = false AND frequency IS NULL) "
        "OR (is_recurring = true AND frequency IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_transaction_recurring_frequency", "transactions", type_="check")
    op.drop_column("transactions", "payment_method")
    op.drop_column("transactions", "frequency")
    op.drop_column("transactions", "is_recurring")
    op.execute("DROP TYPE IF EXISTS transaction_payment_method")
    op.execute("DROP TYPE IF EXISTS transaction_frequency")
