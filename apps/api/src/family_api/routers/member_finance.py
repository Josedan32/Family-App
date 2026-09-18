"""Reads of ANOTHER member's finances.

EVERY route in this module declares a visibility dependency. If you add a
route here without one, tests/visibility/test_route_coverage.py fails the
build. That is deliberate.
"""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household
from family_api.db.session import get_session
from family_api.periods import parse_period
from family_api.routers.debt_views import debt_response
from family_api.schemas.debt import DebtResponse, DebtSummaryResponse
from family_api.schemas.finance_summary import MonthlySummaryResponse
from family_api.schemas.savings import SavingsGoalResponse, SavingsSummaryResponse
from family_api.schemas.transaction import (
    CategoryRef,
    MoneyTotalResponse,
    TransactionListResponse,
    TransactionResponse,
)
from family_api.services import debts as debt_service
from family_api.services import finance_summary as finance_summary_service
from family_api.services import savings as savings_service
from family_api.services import transactions as transaction_service
from family_api.services.visibility import Level, VisibilityScope, visibility_for

router = APIRouter(prefix="/members", tags=["member-finance"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _household(session: AsyncSession, household_id: UUID) -> Household:
    household = await session.get(Household, household_id)
    assert household is not None
    return household


async def _transactions_view(
    scope: VisibilityScope, session: AsyncSession, kind: str, period: str | None
) -> TransactionListResponse | MoneyTotalResponse:
    household = await _household(session, scope.owner.household_id)
    start, end = parse_period(period, household.timezone)

    if scope.level is Level.SUMMARY:
        total = await transaction_service.total_for(session, scope.owner.id, kind, start, end)
        return MoneyTotalResponse(
            period=f"{start.year:04d}-{start.month:02d}",
            total_minor=total,
            currency=household.currency,
        )

    rows = await transaction_service.list_transactions(
        session, scope.owner.id, scope.owner.household_id, kind, start, end
    )
    return TransactionListResponse(
        items=[
            TransactionResponse(
                id=t.id, kind=t.kind,
                categories=[CategoryRef(id=cid, name=cname) for cid, cname in categories],
                amount_minor=t.amount_minor, currency=household.currency,
                occurred_on=t.occurred_on, name=t.name, note=t.note, source=t.source,
                is_recurring=t.is_recurring, frequency=t.frequency,
                payment_method=t.payment_method,
            )
            for t, categories in rows
        ],
        next_cursor=None,
    )


@router.get("/{member_id}/income")
async def member_income(
    scope: Annotated[VisibilityScope, Depends(visibility_for("income"))],
    session: SessionDep,
    period: str | None = None,
) -> TransactionListResponse | MoneyTotalResponse:
    return await _transactions_view(scope, session, "income", period)


@router.get("/{member_id}/expenses")
async def member_expenses(
    scope: Annotated[VisibilityScope, Depends(visibility_for("expenses"))],
    session: SessionDep,
    period: str | None = None,
) -> TransactionListResponse | MoneyTotalResponse:
    return await _transactions_view(scope, session, "expense", period)


@router.get("/{member_id}/savings")
async def member_savings(
    scope: Annotated[VisibilityScope, Depends(visibility_for("savings"))],
    session: SessionDep,
) -> list[SavingsGoalResponse] | SavingsSummaryResponse:
    household = await _household(session, scope.owner.household_id)

    if scope.level is Level.SUMMARY:
        return SavingsSummaryResponse(
            total_balance_minor=await savings_service.total_balance(session, scope.owner.id),
            currency=household.currency,
        )

    rows = await savings_service.list_goals_with_balances(session, scope.owner.id)
    responses = []
    for g, balance in rows:
        state, days_remaining, is_overdue = savings_service.goal_state(
            balance, g.target_amount_minor, g.target_date, date.today(), g.used_on
        )
        responses.append(
            SavingsGoalResponse(
                id=g.id, name=g.name, target_amount_minor=g.target_amount_minor,
                target_date=g.target_date, priority=g.priority, balance_minor=balance,
                progress=savings_service.progress(balance, g.target_amount_minor),
                currency=household.currency, days_remaining=days_remaining,
                is_overdue=is_overdue, state=state, used_on=g.used_on,
            )
        )
    return responses


@router.get("/{member_id}/debts")
async def member_debts(
    scope: Annotated[VisibilityScope, Depends(visibility_for("debts"))],
    session: SessionDep,
) -> list[DebtResponse] | DebtSummaryResponse:
    household = await _household(session, scope.owner.household_id)

    if scope.level is Level.SUMMARY:
        return DebtSummaryResponse(
            total_outstanding_minor=await debt_service.total_outstanding(
                session, scope.owner.id
            ),
            currency=household.currency,
        )

    rows = await debt_service.list_debts_with_figures(session, scope.owner.id)
    return [debt_response(d, figures, household.currency) for d, figures in rows]


@router.get("/{member_id}/monthly-summary")
async def member_monthly_summary(
    income_scope: Annotated[VisibilityScope, Depends(visibility_for("income"))],
    expenses_scope: Annotated[VisibilityScope, Depends(visibility_for("expenses"))],
    savings_scope: Annotated[VisibilityScope, Depends(visibility_for("savings"))],
    debts_scope: Annotated[VisibilityScope, Depends(visibility_for("debts"))],
    session: SessionDep,
    period: str | None = None,
) -> MonthlySummaryResponse:
    """The summary combines all four modules into one derived figure, so it
    is only released when NONE of them is private for this viewer — a
    remaining-balance figure computed from a hidden module would leak that
    module's total by subtraction. This is stricter than any single-module
    route (docs/visibility-rules.md §3), which is deliberate: a composite
    that always used the least-restrictive of the four would defeat the
    point of a per-module setting."""
    owner = income_scope.owner
    household = await _household(session, owner.household_id)
    start, end = parse_period(period, household.timezone)
    figures = await finance_summary_service.monthly_summary(session, owner.id, start, end)
    return MonthlySummaryResponse(
        period=f"{start.year:04d}-{start.month:02d}",
        currency=household.currency,
        income_minor=figures.income_minor,
        expenses_minor=figures.expenses_minor,
        saved_minor=figures.saved_minor,
        debt_payments_minor=figures.debt_payments_minor,
        remaining_minor=figures.remaining_minor,
        status=figures.status,
    )
