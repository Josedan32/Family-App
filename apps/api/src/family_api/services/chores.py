from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import Chore
from family_api.db.models.household import Household, HouseholdMember
from family_api.errors import DomainError, NotFoundError
from family_api.ids import new_id
from family_api.services.members import require_admin

# FR-M8-02. Seeded data stays in the user's language.
SEEDED_CHORES: tuple[tuple[str, str, int], ...] = (
    ("Sacar la basura", "daily", 1),
    ("Tender camas", "daily", 2),
    ("Lavar platos", "daily", 3),
    ("Lavar ropa", "weekly", 4),
    ("Cocinar", "daily", 5),
    ("Trapear", "weekly", 5),
    ("Limpiar baño", "weekly", 7),
)


class DuplicateChoreError(DomainError):
    type_slug = "duplicate_chore"
    status = 409
    title = "Ya existe una tarea con ese nombre"


def seed_chores(session: AsyncSession, household: Household) -> None:
    for name, frequency, points in SEEDED_CHORES:
        session.add(
            Chore(
                id=new_id(), household_id=household.id, name=name,
                frequency=frequency, effort_points=points,
            )
        )


async def list_chores(
    session: AsyncSession, member: HouseholdMember, include_archived: bool = False
) -> list[Chore]:
    stmt = select(Chore).where(Chore.household_id == member.household_id)
    if not include_archived:
        stmt = stmt.where(Chore.archived_at.is_(None))
    return list(await session.scalars(stmt.order_by(Chore.effort_points, Chore.name)))


async def create_chore(
    session: AsyncSession,
    member: HouseholdMember,
    name: str,
    description: str | None,
    frequency: str,
    effort_points: int,
) -> Chore:
    require_admin(member)
    chore = Chore(
        id=new_id(), household_id=member.household_id, name=name,
        description=description, frequency=frequency, effort_points=effort_points,
    )
    session.add(chore)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise DuplicateChoreError from exc
    return chore


async def _load(session: AsyncSession, member: HouseholdMember, chore_id: UUID) -> Chore:
    chore = await session.scalar(
        select(Chore).where(
            Chore.id == chore_id, Chore.household_id == member.household_id
        )
    )
    if chore is None:
        raise NotFoundError
    return chore


async def update_chore(
    session: AsyncSession,
    member: HouseholdMember,
    chore_id: UUID,
    name: str | None,
    description: str | None,
    frequency: str | None,
    effort_points: int | None,
) -> Chore:
    """Changing effort_points never rewrites existing assignments (FR-M8-04)."""
    require_admin(member)
    chore = await _load(session, member, chore_id)
    if name is not None:
        chore.name = name
    if description is not None:
        chore.description = description
    if frequency is not None:
        chore.frequency = frequency
    if effort_points is not None:
        chore.effort_points = effort_points
    await session.flush()
    return chore


async def archive_chore(
    session: AsyncSession, member: HouseholdMember, chore_id: UUID
) -> None:
    require_admin(member)
    chore = await _load(session, member, chore_id)
    if chore.archived_at is None:
        chore.archived_at = datetime.now(UTC)
    await session.flush()
