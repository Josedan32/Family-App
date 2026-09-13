"""Chores: chore_frequency/assignment_status enums, chores, chore_cycles, chore_assignments.

Revision ID: 0011_chores
Revises: 0010_household_expenses
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0011_chores"
down_revision = "0010_household_expenses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE chore_frequency AS ENUM ('daily','weekly','biweekly','monthly')")
    op.execute(
        "CREATE TYPE assignment_status AS ENUM ('pending','done','skipped','reassigned')"
    )

    op.create_table(
        "chores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("frequency", postgresql.ENUM(name="chore_frequency", create_type=False),
                  nullable=False),
        sa.Column("effort_points", sa.SmallInteger(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("household_id", "name", name="uq_chore_household_name"),
        sa.CheckConstraint("effort_points BETWEEN 1 AND 10", name="ck_chore_effort_range"),
    )

    op.create_table(
        "chore_cycles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("household_id", "starts_on", name="uq_cycle_household_start"),
        sa.CheckConstraint("ends_on >= starts_on", name="ck_cycle_range"),
    )

    op.create_table(
        "chore_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cycle_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("chore_cycles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chore_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("chores.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("member_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("household_members.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("due_on", sa.Date(), nullable=False),
        sa.Column("status", postgresql.ENUM(name="assignment_status", create_type=False),
                  nullable=False, server_default="pending"),
        sa.Column("effort_points", sa.SmallInteger(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by_member_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("household_members.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "(status = 'done') = (completed_at IS NOT NULL)",
            name="ck_assignment_completed_at",
        ),
    )
    op.create_index(
        "ix_assignment_member", "chore_assignments", ["household_id", "member_id", "due_on"]
    )
    op.create_index("ix_assignment_cycle", "chore_assignments", ["cycle_id"])


def downgrade() -> None:
    op.drop_index("ix_assignment_cycle", table_name="chore_assignments")
    op.drop_index("ix_assignment_member", table_name="chore_assignments")
    op.drop_table("chore_assignments")
    op.drop_table("chore_cycles")
    op.drop_table("chores")
    op.execute("DROP TYPE IF EXISTS assignment_status")
    op.execute("DROP TYPE IF EXISTS chore_frequency")
