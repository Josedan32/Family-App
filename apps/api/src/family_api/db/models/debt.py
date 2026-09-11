from datetime import date
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

debt_creditor_type = PgEnum(
    "bank", "family", "credit_card", "addi", "other",
    name="debt_creditor_type", create_type=False,
)
debt_status = PgEnum("active", "paid", "cancelled", name="debt_status", create_type=False)


class Debt(Base, TimestampMixin):
    """Owed to someone OUTSIDE the household.

    A debt between two household members is a `MemberLoan`, a different table
    with different rules (docs/glossary.md §2).
    """

    __tablename__ = "debts"
    __table_args__ = (
        CheckConstraint("principal_minor > 0", name="ck_debt_principal_positive"),
        CheckConstraint(
            "due_day IS NULL OR (due_day BETWEEN 1 AND 31)", name="ck_debt_due_day"
        ),
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
    creditor_type: Mapped[str] = mapped_column(debt_creditor_type, nullable=False)
    creditor_label: Mapped[str] = mapped_column(String(120), nullable=False)
    principal_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    annual_interest_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    due_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    status: Mapped[str] = mapped_column(debt_status, nullable=False, server_default="active")


class DebtPayment(Base, TimestampMixin):
    __tablename__ = "debt_payments"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_debt_payment_positive"),
        Index("ix_debt_payment_debt", "debt_id", "paid_on"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    debt_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("debts.id", ondelete="CASCADE"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
