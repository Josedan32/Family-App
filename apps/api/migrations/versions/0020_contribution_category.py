"""Optional chosen category on contributions.

Adds `contributions.category_id`, a nullable FK to `categories`. It is the
member's optional, ADDITIONAL category for the contribution's mirrored
expense — the fixed system category ("Aporte al hogar") is never replaced.
`record_contribution` attaches it via `transaction_categories` alongside
the system category when present (Task 9).

Revision ID: 0020_contribution_category
Revises: 0019_txn_recurrence_payment
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0020_contribution_category"
down_revision = "0019_txn_recurrence_payment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "contributions",
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("contributions", "category_id")
