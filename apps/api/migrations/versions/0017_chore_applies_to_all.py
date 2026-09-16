"""A chore that applies to every eligible member, not the balanced draw.

"Tender la cama" or "lavar su propio plato" is not divided by effort — it
generates one assignment per eligible member, every occurrence.

Revision ID: 0017_chore_applies_to_all
Revises: 0016_transaction_categories
"""

import sqlalchemy as sa
from alembic import op

revision = "0017_chore_applies_to_all"
down_revision = "0016_transaction_categories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chores",
        sa.Column(
            "applies_to_all", sa.Boolean(), nullable=False, server_default="false"
        ),
    )


def downgrade() -> None:
    op.drop_column("chores", "applies_to_all")
