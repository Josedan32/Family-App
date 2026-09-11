"""The visibility resolver.

READ docs/visibility-rules.md BEFORE CHANGING ANYTHING HERE.

This is the security core of the product. A bug here is not a defect, it is a
breach, and it is silent — nobody files a bug report saying "I can see my
father's salary".
"""

import logging
from dataclasses import dataclass
from enum import StrEnum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.seeded import VisibilitySetting
from family_api.services.households import DEFAULT_VISIBILITY

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
