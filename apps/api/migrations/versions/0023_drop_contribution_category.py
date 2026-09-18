"""Contributions carry any number of chosen categories.

Drops `contributions.category_id`. A contribution's chosen categories now
live only on its mirrored expense, as `transaction_categories` rows after the
fixed "Aporte al hogar" one. `record_contribution` has always written the one
chosen category there as well, so nothing is lost; the column would only be a
second copy of a single entry in a list.

The downgrade restores the column from the first chosen category.

Revision ID: 0023_drop_contribution_category
Revises: 0022_debt_fields_payment_method
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0023_drop_contribution_category"
down_revision = "0022_debt_fields_payment_method"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("contributions", "category_id")


def downgrade() -> None:
    op.add_column(
        "contributions",
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.execute(
        """
        UPDATE contributions c
        SET category_id = (
            SELECT tc.category_id
            FROM transaction_categories tc
            JOIN transactions t ON t.id = tc.transaction_id
            WHERE tc.transaction_id = c.expense_transaction_id
              AND tc.category_id <> t.category_id
            ORDER BY tc.created_at, tc.id
            LIMIT 1
        )
        """
    )
