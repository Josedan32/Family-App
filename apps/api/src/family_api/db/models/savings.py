from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

savings_entry_kind = PgEnum(
    "deposit", "withdrawal", name="savings_entry_kind", create_type=False
)
savings_priority = PgEnum(
    "alta", "media", "baja", name="savings_priority", create_type=False
)


class SavingsGoal(Base, TimestampMixin):
    """No balance column by design.

    Balance is SUM(deposits) - SUM(withdrawals), computed on read (FR-M2-08).
    A stored balance is a second source of truth waiting to disagree.
    """

    __tablename__ = "savings_goals"
    __table_args__ = (
        CheckConstraint("target_amount_minor > 0", name="ck_goal_target_positive"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    target_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    priority: Mapped[str] = mapped_column(
        savings_priority, nullable=False, server_default="media"
    )
    # Set when the saved money was spent on what it was saved for. From then
    # on the goal is history, not savings: it leaves the savings total and
    # takes no new entries.
    used_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SavingsEntry(Base, TimestampMixin):
    __tablename__ = "savings_entries"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_savings_entry_positive"),
        Index("ix_savings_entry_goal", "goal_id", "occurred_on"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    goal_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("savings_goals.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(savings_entry_kind, nullable=False)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
