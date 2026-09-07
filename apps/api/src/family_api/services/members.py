from datetime import date
from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.user import User
from family_api.db.session import get_session
from family_api.errors import ForbiddenRoleError, NotFoundError
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
