"""The visibility resolver.

READ docs/visibility-rules.md BEFORE CHANGING ANYTHING HERE.

This is the security core of the product. A bug here is not a defect, it is a
breach, and it is silent — nobody files a bug report saying "I can see my
father's salary".
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.seeded import VisibilitySetting
from family_api.db.session import get_session
from family_api.errors import NotVisibleError
from family_api.services.households import DEFAULT_VISIBILITY
from family_api.services.members import current_member

logger = logging.getLogger(__name__)

MODULES = ("income", "expenses", "savings", "debts")


class Level(StrEnum):
    FULL = "full"
    SUMMARY = "summary"
    NONE = "none"


_STORED_TO_LEVEL = {
    "public": Level.FULL,
    "summary": Level.SUMMARY,
    "private": Level.NONE,
}


@dataclass(frozen=True)
class VisibilityScope:
    viewer: HouseholdMember
    owner: HouseholdMember
    level: Level
    module: str


async def resolve(
    session: AsyncSession,
    viewer: HouseholdMember,
    owner: HouseholdMember,
    module: str,
) -> Level:
    """Resolve what `viewer` may see of `owner`'s `module`.

    Order matters and is specified in docs/visibility-rules.md §2:
    cross-household first, self second, guest third, stored setting last.
    """
    if viewer.household_id != owner.household_id:
        return Level.NONE

    # Settings govern what OTHERS see. You always see yourself (VR-03).
    if viewer.id == owner.id:
        return Level.FULL

    # Public means public to the household. A guest is a visitor (VR-02).
    if viewer.role == "guest":
        return Level.NONE

    try:
        stored = await session.scalar(
            select(VisibilitySetting.level).where(
                VisibilitySetting.member_id == owner.id,
                VisibilitySetting.module == module,
            )
        )
    except Exception:
        # Fail closed. A resolver that cannot decide must deny (VR-05).
        logger.exception(
            "visibility lookup failed; denying", extra={"visibility_module": module}
        )
        return Level.NONE

    if stored is None:
        stored = DEFAULT_VISIBILITY.get(module, "private")

    return _STORED_TO_LEVEL.get(stored, Level.NONE)


def visibility_for(module: str) -> Callable[..., object]:
    """Build the required dependency for a member-scoped read route.

    A route declares its policy in its signature rather than calling a helper
    it might forget. The route-coverage test enforces that every finance read
    route has one.
    """
    if module not in MODULES:
        raise ValueError(f"Unknown visibility module: {module}")

    async def dependency(
        member_id: UUID,
        viewer: Annotated[HouseholdMember, Depends(current_member)],
        session: Annotated[AsyncSession, Depends(get_session)],
    ) -> VisibilityScope:
        # Resolve BEFORE touching any finance table, so a denial costs the same
        # whether the member exists or not (docs/visibility-rules.md §4.4).
        owner = await session.scalar(
            select(HouseholdMember).where(HouseholdMember.id == member_id)
        )
        if owner is None:
            # Uniform with a privacy denial: "does not exist" is information.
            raise NotVisibleError

        level = await resolve(session, viewer, owner, module)
        if level is Level.NONE:
            raise NotVisibleError
        return VisibilityScope(viewer=viewer, owner=owner, level=level, module=module)

    # Read by the route-coverage test.
    dependency.__visibility_policy__ = module  # type: ignore[attr-defined]
    return dependency
