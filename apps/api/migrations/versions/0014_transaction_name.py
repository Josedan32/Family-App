"""Add an optional display name to transactions.

Lets an expense/income carry a short name ("Mercado de la semana") shown
alongside its category, the same way a contribution shows its note.

Revision ID: 0014_transaction_name
Revises: 0013_chore_catalog_and_seed
"""

import sqlalchemy as sa
from alembic import op

revision = "0014_transaction_name"
down_revision = "0013_chore_catalog_and_seed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("name", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("transactions", "name")
