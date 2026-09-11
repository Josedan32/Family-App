from datetime import date
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Text,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

loan_status = PgEnum(
    "pending", "partially_paid", "paid", "cancelled", name="loan_status", create_type=False
)


class MemberLoan(Base, TimestampMixin):
    """One fact, one row.

    Both parties are named on this single row, so the lender's receivable and
    the borrower's payable are literally the same record and cannot drift
    apart (FR-M2-12, FR-M2-13).
    """

    __tablename__ = "member_loans"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_loan_amount_positive"),
        CheckConstraint(
            "lender_member_id <> borrower_member_id", name="ck_loan_distinct_parties"
        ),
        Index("ix_loan_lender", "household_id", "lender_member_id"),
        Index("ix_loan_borrower", "household_id", "borrower_member_id"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    lender_member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    borrower_member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    lent_on: Mapped[date] = mapped_column(Date, nullable=False)
    due_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(loan_status, nullable=False, server_default="pending")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class MemberLoanPayment(Base, TimestampMixin):
    __tablename__ = "member_loan_payments"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_loan_payment_positive"),
        Index("ix_loan_payment_loan", "loan_id", "paid_on"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    loan_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("member_loans.id", ondelete="CASCADE"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    recorded_by_member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("household_members.id"), nullable=False
    )
