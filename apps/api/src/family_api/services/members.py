from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.user import User
from family_api.db.session import get_session
from family_api.errors import ForbiddenRoleError, LastAdminError, NotFoundError
from family_api.security.deps import current_user


def derive_age(birth_date: date | None) -> int | None:
    """FR-M1-06. Age is a fact that rots, so it is computed, never stored."""
    if birth_date is None:
        return None
    today = date.today()
    had_birthday = (today.month, today.day) >= (birth_date.month, birth_date.day)
    return today.year - birth_date.year - (0 if had_birthday else 1)


async def current_member(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> HouseholdMember:
    member = await session.scalar(
        select(HouseholdMember).where(
            HouseholdMember.user_id == user.id, HouseholdMember.status == "active"
        )
    )
    if member is None:
        raise NotFoundError
    return member


CurrentMember = Annotated[HouseholdMember, Depends(current_member)]


def require_admin(member: HouseholdMember) -> None:
    """Admin is a logistics role. It never grants visibility into finances."""
    if member.role != "admin":
        raise ForbiddenRoleError


async def assert_not_last_admin(
    session: AsyncSession, household_id: UUID, member_id: UUID
) -> None:
    """INV-R-01.

    A partial unique index cannot express "at least one", so this runs inside
    the caller's transaction with the household row locked, which serializes
    two admins demoting each other simultaneously.
    """
    await session.execute(
        select(Household.id).where(Household.id == household_id).with_for_update()
    )
    remaining = await session.scalar(
        select(func.count())
        .select_from(HouseholdMember)
        .where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.role == "admin",
            HouseholdMember.status == "active",
            HouseholdMember.id != member_id,
        )
    )
    if not remaining:
        raise LastAdminError


async def _load_member(
    session: AsyncSession, actor: HouseholdMember, member_id: UUID
) -> HouseholdMember:
    member = await session.scalar(
        select(HouseholdMember).where(
            HouseholdMember.id == member_id,
            HouseholdMember.household_id == actor.household_id,
        )
    )
    if member is None:
        raise NotFoundError
    return member


async def update_member(
    session: AsyncSession,
    actor: HouseholdMember,
    member_id: UUID,
    role: str | None,
    relationship: str | None,
) -> HouseholdMember:
    require_admin(actor)
    member = await _load_member(session, actor, member_id)

    if role is not None and role != member.role and member.role == "admin":
        await assert_not_last_admin(session, actor.household_id, member.id)
    if role is not None:
        member.role = role
    if relationship is not None:
        member.relationship = relationship

    await session.flush()
    return member


async def deactivate_member(
    session: AsyncSession, actor: HouseholdMember, member_id: UUID
) -> None:
    """INV-R-03: records are retained and stay attributed."""
    require_admin(actor)
    member = await _load_member(session, actor, member_id)
    if member.role == "admin":
        await assert_not_last_admin(session, actor.household_id, member.id)
    member.status = "inactive"
    await session.flush()
