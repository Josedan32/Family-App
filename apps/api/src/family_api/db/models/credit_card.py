from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

credit_card_status = PgEnum("active", "cancelled", name="credit_card_status", create_type=False)


class CreditCard(Base, TimestampMixin):
    """A revolving credit card. Not a `Debt` — see docs/glossary.md §2."""

    __tablename__ = "credit_cards"
    __table_args__ = (
        CheckConstraint("credit_limit_minor > 0", name="ck_credit_card_limit_positive"),
        CheckConstraint("interest_rate_monthly_pct >= 0", name="ck_credit_card_rate_nonneg"),
        CheckConstraint("minimum_payment_pct >= 0", name="ck_credit_card_min_pct_nonneg"),
        CheckConstraint(
            "minimum_payment_floor_minor IS NULL OR minimum_payment_floor_minor > 0",
            name="ck_credit_card_floor_positive",
        ),
        CheckConstraint(
            "statement_cutoff_day BETWEEN 1 AND 28", name="ck_credit_card_cutoff_day"
        ),
        CheckConstraint("payment_due_days > 0", name="ck_credit_card_due_days_positive"),
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
    nickname: Mapped[str] = mapped_column(String(120), nullable=False)
    bank_label: Mapped[str] = mapped_column(String(120), nullable=False)
    credit_limit_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    interest_rate_monthly_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    minimum_payment_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    minimum_payment_floor_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    statement_cutoff_day: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    payment_due_days: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="15")
    status: Mapped[str] = mapped_column(credit_card_status, nullable=False, server_default="active")


class CreditCardPurchase(Base, TimestampMixin):
    __tablename__ = "credit_card_purchases"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_ccp_amount_positive"),
        CheckConstraint(
            "installments_total IS NULL AND installment_amount_minor IS NULL "
            "AND first_installment_on IS NULL "
            "OR installments_total IS NOT NULL AND installment_amount_minor IS NOT NULL "
            "AND first_installment_on IS NOT NULL",
            name="ck_ccp_installment_plan_complete",
        ),
        CheckConstraint(
            "installments_total IS NULL OR installments_total > 0",
            name="ck_ccp_installments_positive",
        ),
        CheckConstraint(
            "installment_amount_minor IS NULL OR installment_amount_minor > 0",
            name="ck_ccp_installment_amount_positive",
        ),
        Index("ix_ccp_card_purchased_on", "card_id", "purchased_on"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    card_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("credit_cards.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    purchased_on: Mapped[date] = mapped_column(Date, nullable=False)
    installments_total: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    installment_amount_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    first_installment_on: Mapped[date | None] = mapped_column(Date, nullable=True)


class CreditCardPayment(Base, TimestampMixin):
    __tablename__ = "credit_card_payments"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_ccpay_amount_positive"),
        Index("ix_ccpay_card_paid_on", "card_id", "paid_on"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    card_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("credit_cards.id", ondelete="CASCADE"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class CreditCardStatement(Base):
    """Frozen at generation. Never updated after insert (FR-M2-27)."""

    __tablename__ = "credit_card_statements"
    __table_args__ = (
        UniqueConstraint("card_id", "cycle_starts_on", name="uq_ccs_card_cycle"),
        Index("ix_ccs_card_cycle_desc", "card_id", "cycle_starts_on"),
        CheckConstraint("opening_balance_minor >= 0", name="ck_ccs_opening_nonneg"),
        CheckConstraint("purchases_total_minor >= 0", name="ck_ccs_purchases_nonneg"),
        CheckConstraint("installments_due_minor >= 0", name="ck_ccs_installments_nonneg"),
        CheckConstraint("interest_charged_minor >= 0", name="ck_ccs_interest_nonneg"),
        CheckConstraint("payments_total_minor >= 0", name="ck_ccs_payments_nonneg"),
        CheckConstraint("closing_balance_minor >= 0", name="ck_ccs_closing_nonneg"),
        CheckConstraint("minimum_payment_minor >= 0", name="ck_ccs_minpay_nonneg"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    card_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("credit_cards.id", ondelete="CASCADE"), nullable=False
    )
    cycle_starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    cycle_ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    opening_balance_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    purchases_total_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    installments_due_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    interest_charged_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    payments_total_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    closing_balance_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    minimum_payment_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    payment_due_on: Mapped[date] = mapped_column(Date, nullable=False)
