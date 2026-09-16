"""Per-member "seen" state for a chore cycle draw.

The dashboard card announcing a new draw hides once a member has seen it —
but only for that member, and only until the next cycle is drawn.

Revision ID: 0018_chore_cycle_views
Revises: 0017_chore_applies_to_all
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0018_chore_cycle_views"
down_revision = "0017_chore_applies_to_all"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chore_cycle_views",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "cycle_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chore_cycles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("household_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "seen_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("cycle_id", "member_id", name="uq_chore_cycle_view"),
    )


def downgrade() -> None:
    op.drop_table("chore_cycle_views")
