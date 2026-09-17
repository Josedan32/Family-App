"""Savings goal priority.

Adds `savings_priority` enum and `savings_goals.priority`, a genuine
user-entered field (Alta/Media/Baja) — unlike `days_remaining`/`is_overdue`/
`state`, which stay derived on read and are never stored (Task 13).

Revision ID: 0021_savings_priority
Revises: 0020_contribution_category
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0021_savings_priority"
down_revision = "0020_contribution_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE savings_priority AS ENUM ('alta', 'media', 'baja')")
    op.add_column(
        "savings_goals",
        sa.Column(
            "priority",
            postgresql.ENUM(name="savings_priority", create_type=False),
            nullable=False,
            server_default="media",
        ),
    )


def downgrade() -> None:
    op.drop_column("savings_goals", "priority")
    op.execute("DROP TYPE IF EXISTS savings_priority")
