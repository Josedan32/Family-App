from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base

category_kind = PgEnum("income", "expense", name="category_kind", create_type=False)
visibility_module = PgEnum(
    "income", "expenses", "savings", "debts", name="visibility_module", create_type=False
)
visibility_level = PgEnum(
    "private", "summary", "public", name="visibility_level", create_type=False
)


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("household_id", "kind", "name", name="uq_category_household_kind_name"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(category_kind, nullable=False)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    icon: Mapped[str | None] = mapped_column(Text, nullable=True)
    # System categories archive but never delete (FR-M2-02).
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class VisibilitySetting(Base):
    __tablename__ = "visibility_settings"
    __table_args__ = (
        UniqueConstraint("member_id", "module", name="uq_visibility_member_module"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="CASCADE"),
        nullable=False,
    )
    module: Mapped[str] = mapped_column(visibility_module, nullable=False)
    level: Mapped[str] = mapped_column(visibility_level, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
