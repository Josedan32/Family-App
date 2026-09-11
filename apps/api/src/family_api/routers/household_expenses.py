from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household
from family_api.db.session import get_session
from family_api.schemas.household_expense import PotResponse
from family_api.services import household_expenses as ledger_service
from family_api.services.members import CurrentMember

router = APIRouter(prefix="/household-expenses", tags=["household-ledger"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _currency(session: AsyncSession, household_id: UUID) -> str:
    household = await session.get(Household, household_id)
    assert household is not None
    return household.currency


@router.get("/pot")
async def pot(member: CurrentMember, session: SessionDep) -> PotResponse:
    """Always visible to every household member (FR-M4-15)."""
    figures = await ledger_service.pot_figures(session, member.household_id)
    return PotResponse(
        collected_minor=figures.collected_minor,
        spent_minor=figures.spent_minor,
        balance_minor=figures.balance_minor,
        currency=await _currency(session, member.household_id),
    )
