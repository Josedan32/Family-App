"""Household ledger: expense_funding enum, household_expenses, contributions.in_kind.

Revision ID: 0010_household_expenses
Revises: 0009_debt_installments
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010_household_expenses"
down_revision = "0009_debt_installments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE expense_funding AS ENUM ('pot','member')")
    # Existing rows are all 'manual' or 'contribution'; adding a value is safe.
    op.execute("ALTER TYPE transaction_source ADD VALUE IF NOT EXISTS 'household_expense'")

    op.add_column(
        "contributions",
        sa.Column("in_kind", sa.Boolean(), nullable=False, server_default="false"),
    )

    op.create_table(
        "household_expenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("funding",
                  postgresql.ENUM(name="expense_funding", create_type=False),
                  nullable=False),
        sa.Column("paid_by_member_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("household_members.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("expense_transaction_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("transactions.id", ondelete="RESTRICT"),
                  nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount_minor > 0", name="ck_household_expense_positive"),
        sa.CheckConstraint(
            "funding = 'pot' AND paid_by_member_id IS NULL "
            "AND expense_transaction_id IS NULL "
            "OR funding = 'member' AND paid_by_member_id IS NOT NULL "
            "AND expense_transaction_id IS NOT NULL",
            name="ck_household_expense_funding",
        ),
    )
    op.create_index(
        "ix_household_expense_ledger", "household_expenses", ["household_id", "occurred_on"]
    )


def downgrade() -> None:
    op.drop_index("ix_household_expense_ledger", table_name="household_expenses")
    op.drop_table("household_expenses")
    op.drop_column("contributions", "in_kind")
    op.execute("DROP TYPE IF EXISTS expense_funding")
    # Postgres cannot remove a value from an enum. Leaving 'household_expense'
    # on transaction_source is harmless and is noted here so the asymmetry is
    # deliberate rather than an oversight.
