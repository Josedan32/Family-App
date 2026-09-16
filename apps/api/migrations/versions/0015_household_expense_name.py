"""Add an optional display name to household expenses.

Same rationale as 0014 for personal transactions: a short name shown
alongside the category, instead of overloading the note field.

Revision ID: 0015_household_expense_name
Revises: 0014_transaction_name
"""

import sqlalchemy as sa
from alembic import op

revision = "0015_household_expense_name"
down_revision = "0014_transaction_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "household_expenses", sa.Column("name", sa.String(length=120), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("household_expenses", "name")
