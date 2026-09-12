from datetime import date
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

expense_funding = PgEnum("pot", "member", name="expense_funding", create_type=False)


class HouseholdExpense(Base, TimestampMixin):
    """The household's own ledger.

    Distinct from `Transaction`, which is a row in ONE member's personal
    ledger. A member-funded household expense generates a transaction, but they
    are two rows in two tables with two different visibility rules
    (docs/visibility-rules.md §5.3).
    """

    __tablename__ = "household_expenses"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_household_expense_positive"),
        CheckConstraint(
            "funding = 'pot' AND paid_by_member_id IS NULL "
            "AND expense_transaction_id IS NULL "
            "OR funding = 'member' AND paid_by_member_id IS NOT NULL "
            "AND expense_transaction_id IS NOT NULL",
            name="ck_household_expense_funding",
        ),
        Index("ix_household_expense_ledger", "household_id", "occurred_on"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    funding: Mapped[str] = mapped_column(expense_funding, nullable=False)
    paid_by_member_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=True,
    )
    # The payer's mirrored personal expense (FR-M4-11). UNIQUE so no two
    # household expenses can claim the same transaction.
    expense_transaction_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="RESTRICT"),
        nullable=True,
        unique=True,
    )
