from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.seeded import Category
from family_api.errors import DomainError, NotFoundError
from family_api.ids import new_id


class DuplicateCategoryError(DomainError):
    type_slug = "duplicate_category"
    status = 409
    title = "Ya existe una categoría con ese nombre"


async def list_categories(
    session: AsyncSession,
    member: HouseholdMember,
    kind: str | None = None,
    include_archived: bool = False,
) -> list[Category]:
    stmt = select(Category).where(Category.household_id == member.household_id)
    if kind is not None:
        stmt = stmt.where(Category.kind == kind)
    if not include_archived:
        stmt = stmt.where(Category.archived_at.is_(None))
    return list(await session.scalars(stmt.order_by(Category.name)))


async def create_category(
    session: AsyncSession, member: HouseholdMember, kind: str, name: str, icon: str | None
) -> Category:
    category = Category(
        id=new_id(), household_id=member.household_id,
        kind=kind, name=name, icon=icon, is_system=False,
    )
    session.add(category)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise DuplicateCategoryError from exc
    return category


async def _load(
    session: AsyncSession, member: HouseholdMember, category_id: UUID
) -> Category:
    category = await session.scalar(
        select(Category).where(
            Category.id == category_id, Category.household_id == member.household_id
        )
    )
    if category is None:
        raise NotFoundError
    return category


async def update_category(
    session: AsyncSession,
    member: HouseholdMember,
    category_id: UUID,
    name: str | None,
    icon: str | None,
) -> Category:
    category = await _load(session, member, category_id)
    if name is not None:
        category.name = name
    if icon is not None:
        category.icon = icon
    await session.flush()
    return category


async def archive_category(
    session: AsyncSession, member: HouseholdMember, category_id: UUID
) -> None:
    """Archive, never delete. Historical records keep their category (FR-M2-02)."""
    category = await _load(session, member, category_id)
    if category.archived_at is None:
        category.archived_at = datetime.now(UTC)
    await session.flush()
