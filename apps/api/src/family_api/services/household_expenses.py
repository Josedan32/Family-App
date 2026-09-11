from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.contribution import Contribution
from family_api.db.models.household_expense import HouseholdExpense


@dataclass(frozen=True)
class PotFigures:
    collected_minor: int
    spent_minor: int
    balance_minor: int


async def pot_figures(session: AsyncSession, household_id: UUID) -> PotFigures:
    """Derived, never stored (FR-M4-13).

    `collected` counts only NON-in-kind contributions: an in-kind contribution
    went straight from a member's pocket to an expense and never arrived in the
    pot. Counting it here would report cash the household does not have.
    """
    collected = await session.scalar(
        select(func.coalesce(func.sum(Contribution.amount_minor), 0)).where(
            Contribution.household_id == household_id,
            Contribution.in_kind.is_(False),
        )
    )
    spent = await session.scalar(
        select(func.coalesce(func.sum(HouseholdExpense.amount_minor), 0)).where(
            HouseholdExpense.household_id == household_id,
            HouseholdExpense.funding == "pot",
        )
    )
    collected, spent = int(collected or 0), int(spent or 0)
    return PotFigures(
        collected_minor=collected, spent_minor=spent, balance_minor=collected - spent
    )
