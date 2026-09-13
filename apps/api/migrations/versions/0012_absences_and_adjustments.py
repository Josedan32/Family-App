"""Household effort window, member_absences, effort_adjustments.

Revision ID: 0012_absences_and_adjustments
Revises: 0011_chores
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0012_absences_and_adjustments"
down_revision = "0011_chores"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "households",
        sa.Column("effort_window_days", sa.SmallInteger(), nullable=False, server_default="60"),
    )
    op.create_check_constraint(
        "ck_household_effort_window", "households", "effort_window_days BETWEEN 7 AND 365"
    )

    op.create_table(
        "member_absences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("member_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("ends_on >= starts_on", name="ck_absence_range"),
    )
    op.create_index(
        "ix_absence_member", "member_absences", ["household_id", "member_id", "starts_on"]
    )

    op.create_table(
        "effort_adjustments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("member_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_by_member_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("household_members.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("points <> 0", name="ck_adjustment_nonzero"),
    )


def downgrade() -> None:
    op.drop_table("effort_adjustments")
    op.drop_index("ix_absence_member", table_name="member_absences")
    op.drop_table("member_absences")
    op.drop_constraint("ck_household_effort_window", "households", type_="check")
    op.drop_column("households", "effort_window_days")
