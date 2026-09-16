"""Multiple categories per transaction.

A personal transaction can now carry more than one category. The
personal-finance side of the app moves to `transaction_categories`; the
household ledger (household_expenses) and the contribution mirror keep a
single category by design (spec §8.4 note on two surfaces, two rules).

`transactions.category_id` stays as the row's own column so nothing else
that reads it needs to change; this migration backfills one
`transaction_categories` row per existing transaction from that column, and
`create_transaction`/`update_transaction` keep both in sync going forward.

Revision ID: 0016_transaction_categories
Revises: 0015_household_expense_name
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0016_transaction_categories"
down_revision = "0015_household_expense_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transaction_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "transaction_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("transactions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "transaction_id", "category_id", name="uq_transaction_category"
        ),
    )
    op.create_index(
        "ix_transaction_category_lookup",
        "transaction_categories",
        ["household_id", "category_id"],
    )

    # Backfill: every existing transaction gets one row from its own category_id.
    op.execute(
        """
        INSERT INTO transaction_categories (id, household_id, transaction_id, category_id)
        SELECT gen_random_uuid(), household_id, id, category_id FROM transactions
        """
    )


def downgrade() -> None:
    op.drop_index("ix_transaction_category_lookup", table_name="transaction_categories")
    op.drop_table("transaction_categories")
