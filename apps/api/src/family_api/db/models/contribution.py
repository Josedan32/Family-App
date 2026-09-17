from datetime import date
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

period_status = PgEnum("open", "closed", name="period_status", create_type=False)


class ContributionPeriod(Base, TimestampMixin):
    __tablename__ = "contribution_periods"
    __table_args__ = (
        UniqueConstraint("household_id", "period_month", name="uq_period_household_month"),
        CheckConstraint("goal_amount_minor > 0", name="ck_period_goal_positive"),
        CheckConstraint(
            "EXTRACT(DAY FROM period_month) = 1", name="ck_period_month_is_first"
        ),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    period_month: Mapped[date] = mapped_column(Date, nullable=False)
    goal_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(period_status, nullable=False, server_default="open")


class ContributionPledge(Base, TimestampMixin):
    __tablename__ = "contribution_pledges"
    __table_args__ = (
        UniqueConstraint("period_id", "member_id", name="uq_pledge_period_member"),
        CheckConstraint("expected_amount_minor > 0", name="ck_pledge_positive"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    period_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("contribution_periods.id", ondelete="CASCADE"),
        nullable=False,
    )
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="CASCADE"),
        nullable=False,
    )
    expected_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)


class Contribution(Base, TimestampMixin):
    """Money a member puts into the shared household pot.

    `expense_transaction_id` is NOT NULL and UNIQUE: a contribution cannot
    exist without its mirrored personal expense, and no two contributions can
    claim the same one (INV-D-01, FR-M4-05).

    ON DELETE RESTRICT means the transaction cannot be removed out from under
    the contribution — deletion must go through the service, which removes
    both in the correct order inside one transaction.
    """

    __tablename__ = "contributions"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_contribution_positive"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    period_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("contribution_periods.id", ondelete="RESTRICT"),
        nullable=False,
    )
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    expense_transaction_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    # True when a member paid a household expense directly (FR-M4-12). Counts
    # toward the period GOAL but never toward the POT BALANCE — that money went
    # pocket-to-expense and never arrived (FR-M4-13).
    in_kind: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # Optional, member-chosen category in ADDITION to the fixed system
    # category ("Aporte al hogar") on the mirrored expense — never replaces
    # it. NULL means the contributor didn't pick one.
    category_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True
    )
