"""Chore catalogue fields and a persisted cycle seed.

Adds activities, requirements and expectation to chores (FR-M8-16), and a seed
to chore_cycles so the draw is reproducible (FR-M8-17).

Revision ID: 0013_chore_catalog_and_seed
Revises: 0012_absences_and_adjustments
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0013_chore_catalog_and_seed"
down_revision = "0012_absences_and_adjustments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default so the rows that already exist stay valid without a
    # backfill pass.
    op.add_column(
        "chores",
        sa.Column(
            "activities",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.add_column(
        "chores",
        sa.Column(
            "requirements",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.add_column("chores", sa.Column("expectation", sa.Text(), nullable=True))

    # Existing cycles were drawn before seeds were recorded; 0 marks them as
    # "not reproducible" rather than pretending to a seed that never existed.
    op.add_column(
        "chore_cycles",
        sa.Column("seed", sa.BigInteger(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("chore_cycles", "seed")
    op.drop_column("chores", "expectation")
    op.drop_column("chores", "requirements")
    op.drop_column("chores", "activities")
