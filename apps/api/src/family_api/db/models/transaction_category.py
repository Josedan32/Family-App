from uuid import UUID

from sqlalchemy import ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin


class TransactionCategory(Base, TimestampMixin):
    """One row per (transaction, category) pair.

    `transactions.category_id` still exists and is kept as the first entry
    here — every other reader of that column is unaffected. This table is
    additive: it is what lets a manually-created transaction carry more than
    one category (household expenses and the contribution mirror stay
    single-category by design, see spec §8.4).
    """

    __tablename__ = "transaction_categories"
    __table_args__ = (
        UniqueConstraint("transaction_id", "category_id", name="uq_transaction_category"),
        Index("ix_transaction_category_lookup", "household_id", "category_id"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    transaction_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False
    )
