from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

chore_frequency = PgEnum(
    "daily", "weekly", "biweekly", "monthly", name="chore_frequency", create_type=False
)
assignment_status = PgEnum(
    "pending", "done", "skipped", "reassigned",
    name="assignment_status", create_type=False,
)


class Chore(Base, TimestampMixin):
    __tablename__ = "chores"
    __table_args__ = (
        UniqueConstraint("household_id", "name", name="uq_chore_household_name"),
        CheckConstraint(
            "effort_points BETWEEN 1 AND 10", name="ck_chore_effort_range"
        ),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    frequency: Mapped[str] = mapped_column(chore_frequency, nullable=False)
    # The currency of the fairness system. Only admins price it (FR-M8-03).
    effort_points: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # The catalogue (FR-M8-16). Native Postgres arrays rather than child tables
    # or JSONB: these are ordered content belonging to one chore, never queried
    # or joined on their own, always read and written whole with their parent.
    activities: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default="{}"
    )
    requirements: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default="{}"
    )
    # The definition of done, in one sentence.
    expectation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # One assignment per eligible member, every occurrence — never the
    # balanced-by-effort draw (see `generate_cycle`).
    applies_to_all: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ChoreCycle(Base):
    __tablename__ = "chore_cycles"
    __table_args__ = (
        UniqueConstraint("household_id", "starts_on", name="uq_cycle_household_start"),
        CheckConstraint("ends_on >= starts_on", name="ck_cycle_range"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    # Seeds the RNG that generated this cycle (FR-M8-17). Persisting it makes
    # the draw reproducible — the wheel replays the identical spin for every
    # viewer, and "why did I get the bathroom?" can be answered by re-running.
    seed: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ChoreAssignment(Base, TimestampMixin):
    __tablename__ = "chore_assignments"
    __table_args__ = (
        CheckConstraint(
            "(status = 'done') = (completed_at IS NOT NULL)",
            name="ck_assignment_completed_at",
        ),
        Index("ix_assignment_member", "household_id", "member_id", "due_on"),
        Index("ix_assignment_cycle", "cycle_id"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    cycle_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("chore_cycles.id", ondelete="CASCADE"), nullable=False
    )
    chore_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("chores.id", ondelete="RESTRICT"), nullable=False
    )
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    due_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        assignment_status, nullable=False, server_default="pending"
    )
    # Frozen at assignment time (FR-M8-04). Re-pricing a chore must never
    # retroactively change what someone already earned.
    effort_points: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Credit follows whoever actually did it, not whoever was assigned it.
    completed_by_member_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("household_members.id"), nullable=True
    )


class MemberAbsence(Base, TimestampMixin):
    __tablename__ = "member_absences"
    __table_args__ = (
        CheckConstraint("ends_on >= starts_on", name="ck_absence_range"),
        Index("ix_absence_member", "household_id", "member_id", "starts_on"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="CASCADE"),
        nullable=False,
    )
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    # Optional: "I am away" is household business, why may not be.
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class EffortAdjustment(Base, TimestampMixin):
    """Manual, attributed, auditable corrections only (FR-M8-14).

    Absence compensation does NOT write rows here — it is emergent from the
    balance rule (FR-M8-13), and duplicating that mechanism in a table would
    create a second source of truth for fairness.
    """

    __tablename__ = "effort_adjustments"
    __table_args__ = (CheckConstraint("points <> 0", name="ck_adjustment_nonzero"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="CASCADE"),
        nullable=False,
    )
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("household_members.id"), nullable=False
    )
