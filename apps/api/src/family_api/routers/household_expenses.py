from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household
from family_api.db.session import get_session
from family_api.periods import parse_period
from family_api.schemas.household_expense import (
    CreateHouseholdExpenseRequest,
    HouseholdExpenseResponse,
    PotResponse,
    UpdateHouseholdExpenseRequest,
)
from family_api.services import household_expenses as ledger_service
from family_api.services.members import CurrentMember

router = APIRouter(prefix="/household-expenses", tags=["household-ledger"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _currency(session: AsyncSession, household_id: UUID) -> str:
    household = await session.get(Household, household_id)
    assert household is not None
    return household.currency


async def _timezone(session: AsyncSession, household_id: UUID) -> str:
    household = await session.get(Household, household_id)
    assert household is not None
    return household.timezone


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


@router.get("")
async def list_expenses(
    member: CurrentMember,
    session: SessionDep,
    period: str | None = None,
    funding: str | None = None,
) -> list[HouseholdExpenseResponse]:
    """Always visible to every household member (FR-M4-15). No resolution."""
    start, end = parse_period(period, await _timezone(session, member.household_id))
    currency = await _currency(session, member.household_id)
    rows = await ledger_service.list_expenses(
        session, member.household_id, start, end, funding
    )
    return [
        HouseholdExpenseResponse(
            id=e.id, category_id=e.category_id, category_name=category_name,
            amount_minor=e.amount_minor, currency=currency, occurred_on=e.occurred_on,
            note=e.note, funding=e.funding, paid_by_member_id=e.paid_by_member_id,
            paid_by_name=payer_name, expense_transaction_id=e.expense_transaction_id,
            contribution_id=contribution_id,
        )
        for e, category_name, payer_name, contribution_id in rows
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_expense(
    body: CreateHouseholdExpenseRequest, member: CurrentMember, session: SessionDep
) -> HouseholdExpenseResponse:
    expense = await ledger_service.create_expense(
        session, member, body.category_id, body.amount_minor, body.occurred_on,
        body.note, body.funding, body.paid_by_member_id, body.counts_as_contribution,
    )
    await session.commit()
    rows = await ledger_service.list_expenses(
        session, member.household_id, expense.occurred_on, expense.occurred_on
    )
    e, category_name, payer_name, contribution_id = next(
        row for row in rows if row[0].id == expense.id
    )
    return HouseholdExpenseResponse(
        id=e.id, category_id=e.category_id, category_name=category_name,
        amount_minor=e.amount_minor,
        currency=await _currency(session, member.household_id),
        occurred_on=e.occurred_on, note=e.note, funding=e.funding,
        paid_by_member_id=e.paid_by_member_id, paid_by_name=payer_name,
        expense_transaction_id=e.expense_transaction_id,
        contribution_id=contribution_id,
    )


@router.patch("/{expense_id}")
async def update_expense(
    expense_id: UUID,
    body: UpdateHouseholdExpenseRequest,
    member: CurrentMember,
    session: SessionDep,
) -> HouseholdExpenseResponse:
    """Amount and funding cannot be part of `body` — `UpdateHouseholdExpenseRequest`
    has no such fields, so they are silently dropped rather than applied."""
    await ledger_service.update_expense(
        session, member, expense_id, body.category_id, body.occurred_on, body.note
    )
    await session.commit()
    rows = await ledger_service.list_expenses(
        session, member.household_id, date.min, date.max
    )
    e, category_name, payer_name, contribution_id = next(
        row for row in rows if row[0].id == expense_id
    )
    return HouseholdExpenseResponse(
        id=e.id, category_id=e.category_id, category_name=category_name,
        amount_minor=e.amount_minor,
        currency=await _currency(session, member.household_id),
        occurred_on=e.occurred_on, note=e.note, funding=e.funding,
        paid_by_member_id=e.paid_by_member_id, paid_by_name=payer_name,
        expense_transaction_id=e.expense_transaction_id,
        contribution_id=contribution_id,
    )


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await ledger_service.delete_expense(session, member, expense_id)
    await session.commit()
