"""Savings goals can be marked as used.

Adds `savings_goals.used_on`: the date the saved money was spent on what it
was saved for. A used goal is history — it leaves the savings total and takes
no new entries — but its rows stay, so what was saved and when is not lost.

Revision ID: 0024_savings_goal_used
Revises: 0023_drop_contribution_category
"""

import sqlalchemy as sa
from alembic import op

revision = "0024_savings_goal_used"
down_revision = "0023_drop_contribution_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("savings_goals", sa.Column("used_on", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("savings_goals", "used_on")
