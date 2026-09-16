from datetime import date
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

transaction_kind = PgEnum(
    "income", "expense", name="transaction_kind", create_type=False
)
transaction_source = PgEnum(
    "manual", "contribution", "household_expense",
    name="transaction_source", create_type=False,
)


class Transaction(Base, TimestampMixin):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_transaction_amount_positive"),
        CheckConstraint(
            "(source = 'manual' AND source_id IS NULL) "
            "OR (source <> 'manual' AND source_id IS NOT NULL)",
            name="ck_transaction_source_id",
        ),
        Index("ix_transaction_ledger", "household_id", "member_id", "occurred_on"),
        Index("ix_transaction_totals", "household_id", "member_id", "kind", "occurred_on"),
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
    kind: Mapped[str] = mapped_column(transaction_kind, nullable=False)
    category_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Rows with source <> 'manual' are derived records: the transactions API
    # refuses to edit or delete them (FR-M2-05).
    source: Mapped[str] = mapped_column(
        transaction_source, nullable=False, server_default="manual"
    )
    source_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
