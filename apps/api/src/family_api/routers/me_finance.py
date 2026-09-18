from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.savings import SavingsGoal
from family_api.db.session import get_session
from family_api.errors import NotFoundError
from family_api.periods import parse_period
from family_api.routers.debt_views import debt_response
from family_api.schemas.debt import (
    CreateDebtPaymentRequest,
    CreateDebtRequest,
    DebtDetailResponse,
    DebtPaymentResponse,
    DebtResponse,
)
from family_api.schemas.finance_summary import MonthlySummaryResponse
from family_api.schemas.savings import (
    CreateEntryRequest,
    CreateGoalRequest,
    SavingsEntryResponse,
    SavingsGoalResponse,
    UseGoalRequest,
)
from family_api.schemas.transaction import (
    CategoryRef,
    CreateTransactionRequest,
    TransactionListResponse,
    TransactionResponse,
    UpdateTransactionRequest,
)
from family_api.services import debts as debt_service
from family_api.services import finance_summary as finance_summary_service
from family_api.services import savings as savings_service
from family_api.services import transactions as transaction_service
from family_api.services.members import CurrentMember
from family_api.services.transactions import CategoryKindMismatchError

router = APIRouter(prefix="/me", tags=["own-finance"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _currency(session: AsyncSession, household_id: UUID) -> str:
    household = await session.get(Household, household_id)
    assert household is not None
    return household.currency


async def _timezone(session: AsyncSession, household_id: UUID) -> str:
    household = await session.get(Household, household_id)
    assert household is not None
    return household.timezone


@router.get("/transactions")
async def list_transactions(
    member: CurrentMember,
    session: SessionDep,
    kind: Literal["income", "expense"] | None = None,
    period: str | None = None,
    category_id: UUID | None = None,
    limit: int = 50,
) -> TransactionListResponse:
    start, end = parse_period(period, await _timezone(session, member.household_id))
    currency = await _currency(session, member.household_id)
    rows = await transaction_service.list_transactions(
        session, member.id, member.household_id, kind, start, end, category_id, min(limit, 200)
    )
    return TransactionListResponse(
        items=[
            TransactionResponse(
                id=t.id, kind=t.kind,
                categories=[CategoryRef(id=cid, name=cname) for cid, cname in categories],
                amount_minor=t.amount_minor, currency=currency,
                occurred_on=t.occurred_on, name=t.name, note=t.note, source=t.source,
                is_recurring=t.is_recurring, frequency=t.frequency,
                payment_method=t.payment_method,
            )
            for t, categories in rows
        ],
        next_cursor=None,
    )


@router.post("/transactions", status_code=status.HTTP_201_CREATED)
async def create_transaction(
    body: CreateTransactionRequest, member: CurrentMember, session: SessionDep
) -> TransactionResponse:
    try:
        transaction = await transaction_service.create_transaction(
            session, member, body.kind, body.category_ids,
            body.amount_minor, body.occurred_on, body.name, body.note,
            body.is_recurring, body.frequency, body.payment_method,
        )
    except CategoryKindMismatchError:
        raise HTTPException(
            status_code=422, detail="Category kind does not match transaction kind"
        ) from None
    await session.commit()
    rows = await transaction_service.list_transactions(
        session, member.id, member.household_id, transaction.kind,
        transaction.occurred_on, transaction.occurred_on,
    )
    categories = next(c for t, c in rows if t.id == transaction.id)
    return TransactionResponse(
        id=transaction.id, kind=transaction.kind,
        categories=[CategoryRef(id=cid, name=cname) for cid, cname in categories],
        amount_minor=transaction.amount_minor,
        currency=await _currency(session, member.household_id),
        occurred_on=transaction.occurred_on, name=transaction.name, note=transaction.note,
        source=transaction.source, is_recurring=transaction.is_recurring,
        frequency=transaction.frequency, payment_method=transaction.payment_method,
    )


@router.get("/transactions/{transaction_id}")
async def get_transaction(
    transaction_id: UUID, member: CurrentMember, session: SessionDep
) -> TransactionResponse:
    """Own ledger only, derived rows included (they are read, never edited)."""
    transaction, categories = await transaction_service.get_own_transaction(
        session, member, transaction_id
    )
    return TransactionResponse(
        id=transaction.id, kind=transaction.kind,
        categories=[CategoryRef(id=cid, name=cname) for cid, cname in categories],
        amount_minor=transaction.amount_minor,
        currency=await _currency(session, member.household_id),
        occurred_on=transaction.occurred_on, name=transaction.name, note=transaction.note,
        source=transaction.source, is_recurring=transaction.is_recurring,
        frequency=transaction.frequency, payment_method=transaction.payment_method,
    )


@router.patch("/transactions/{transaction_id}")
async def update_transaction(
    transaction_id: UUID,
    body: UpdateTransactionRequest,
    member: CurrentMember,
    session: SessionDep,
) -> TransactionResponse:
    try:
        transaction = await transaction_service.update_transaction(
            session, member, transaction_id, body.category_ids,
            body.amount_minor, body.occurred_on, body.name, body.note,
            body.is_recurring, body.frequency, body.payment_method,
        )
    except CategoryKindMismatchError:
        raise HTTPException(status_code=422, detail="Category kind mismatch") from None
    await session.commit()
    rows = await transaction_service.list_transactions(
        session, member.id, member.household_id, transaction.kind,
        transaction.occurred_on, transaction.occurred_on,
    )
    categories = next(c for t, c in rows if t.id == transaction.id)
    return TransactionResponse(
        id=transaction.id, kind=transaction.kind,
        categories=[CategoryRef(id=cid, name=cname) for cid, cname in categories],
        amount_minor=transaction.amount_minor,
        currency=await _currency(session, member.household_id),
        occurred_on=transaction.occurred_on, name=transaction.name, note=transaction.note,
        source=transaction.source, is_recurring=transaction.is_recurring,
        frequency=transaction.frequency, payment_method=transaction.payment_method,
    )


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await transaction_service.delete_transaction(session, member, transaction_id)
    await session.commit()


@router.get("/monthly-summary")
async def monthly_summary(
    member: CurrentMember, session: SessionDep, period: str | None = None
) -> MonthlySummaryResponse:
    start, end = parse_period(period, await _timezone(session, member.household_id))
    currency = await _currency(session, member.household_id)
    figures = await finance_summary_service.monthly_summary(session, member.id, start, end)
    return MonthlySummaryResponse(
        period=f"{start.year:04d}-{start.month:02d}",
        currency=currency,
        income_minor=figures.income_minor,
        expenses_minor=figures.expenses_minor,
        saved_minor=figures.saved_minor,
        debt_payments_minor=figures.debt_payments_minor,
        remaining_minor=figures.remaining_minor,
        status=figures.status,
    )


def _goal_response(goal: SavingsGoal, balance: int, currency: str) -> SavingsGoalResponse:
    state, days_remaining, is_overdue = savings_service.goal_state(
        balance, goal.target_amount_minor, goal.target_date, date.today(), goal.used_on
    )
    return SavingsGoalResponse(
        id=goal.id, name=goal.name, target_amount_minor=goal.target_amount_minor,
        target_date=goal.target_date, priority=goal.priority, balance_minor=balance,
        progress=savings_service.progress(balance, goal.target_amount_minor),
        currency=currency, days_remaining=days_remaining, is_overdue=is_overdue, state=state,
        used_on=goal.used_on,
    )


async def _goal_by_id(
    session: AsyncSession, member: HouseholdMember, goal_id: UUID
) -> SavingsGoalResponse:
    rows = await savings_service.list_goals_with_balances(session, member.id)
    found = next(((g, b) for g, b in rows if g.id == goal_id), None)
    if found is None:
        raise NotFoundError
    goal, balance = found
    return _goal_response(goal, balance, await _currency(session, member.household_id))


@router.get("/savings-goals")
async def list_goals(member: CurrentMember, session: SessionDep) -> list[SavingsGoalResponse]:
    currency = await _currency(session, member.household_id)
    rows = await savings_service.list_goals_with_balances(session, member.id)
    return [_goal_response(g, balance, currency) for g, balance in rows]


@router.post("/savings-goals", status_code=status.HTTP_201_CREATED)
async def create_goal(
    body: CreateGoalRequest, member: CurrentMember, session: SessionDep
) -> SavingsGoalResponse:
    goal = await savings_service.create_goal(
        session, member, body.name, body.target_amount_minor, body.target_date, body.priority
    )
    await session.commit()
    return _goal_response(goal, 0, await _currency(session, member.household_id))


@router.get("/savings-goals/{goal_id}")
async def get_goal(
    goal_id: UUID, member: CurrentMember, session: SessionDep
) -> SavingsGoalResponse:
    return await _goal_by_id(session, member, goal_id)


@router.get("/savings-goals/{goal_id}/entries")
async def list_entries(
    goal_id: UUID, member: CurrentMember, session: SessionDep
) -> list[SavingsEntryResponse]:
    entries = await savings_service.list_entries(session, member, goal_id)
    currency = await _currency(session, member.household_id)
    return [
        SavingsEntryResponse(
            id=e.id, kind=e.kind, amount_minor=e.amount_minor,
            occurred_on=e.occurred_on, note=e.note, currency=currency,
        )
        for e in entries
    ]


@router.post("/savings-goals/{goal_id}/entries", status_code=status.HTTP_201_CREATED)
async def add_entry(
    goal_id: UUID, body: CreateEntryRequest, member: CurrentMember, session: SessionDep
) -> SavingsGoalResponse:
    await savings_service.add_entry(
        session, member, goal_id, body.kind, body.amount_minor, body.occurred_on, body.note
    )
    await session.commit()
    return await _goal_by_id(session, member, goal_id)


@router.post("/savings-goals/{goal_id}/use")
async def use_goal(
    goal_id: UUID, body: UseGoalRequest, member: CurrentMember, session: SessionDep
) -> SavingsGoalResponse:
    await savings_service.mark_goal_used(
        session, member, goal_id, body.used_on or date.today()
    )
    await session.commit()
    return await _goal_by_id(session, member, goal_id)


@router.delete("/savings-goals/{goal_id}/use")
async def unuse_goal(
    goal_id: UUID, member: CurrentMember, session: SessionDep
) -> SavingsGoalResponse:
    await savings_service.unmark_goal_used(session, member, goal_id)
    await session.commit()
    return await _goal_by_id(session, member, goal_id)


@router.get("/debts")
async def list_debts(member: CurrentMember, session: SessionDep) -> list[DebtResponse]:
    currency = await _currency(session, member.household_id)
    rows = await debt_service.list_debts_with_figures(session, member.id)
    return [debt_response(d, figures, currency) for d, figures in rows]


@router.post("/debts", status_code=status.HTTP_201_CREATED)
async def create_debt(
    body: CreateDebtRequest, member: CurrentMember, session: SessionDep
) -> DebtResponse:
    debt = await debt_service.create_debt(
        session, member, body.name, body.creditor_type, body.creditor_label,
        body.principal_minor, body.annual_interest_rate, body.due_day,
        body.installments_total, body.installment_amount_minor,
        body.first_installment_on, body.minimum_payment_minor,
    )
    await session.commit()
    currency = await _currency(session, member.household_id)
    rows = await debt_service.list_debts_with_figures(session, member.id)
    d, figures = next(row for row in rows if row[0].id == debt.id)
    return debt_response(d, figures, currency)


@router.get("/debts/{debt_id}")
async def get_debt(
    debt_id: UUID, member: CurrentMember, session: SessionDep
) -> DebtDetailResponse:
    debt, outstanding, payments = await debt_service.get_debt_detail(session, member, debt_id)
    figures = debt_service.debt_figures(
        debt, outstanding, max((p.paid_on for p in payments), default=None), date.today()
    )
    currency = await _currency(session, member.household_id)
    base = debt_response(debt, figures, currency)
    return DebtDetailResponse(
        **base.model_dump(),
        payments=[
            DebtPaymentResponse(
                id=p.id, amount_minor=p.amount_minor, paid_on=p.paid_on, note=p.note,
                payment_method=p.payment_method,
            )
            for p in payments
        ],
    )


@router.delete("/debts/{debt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_debt(debt_id: UUID, member: CurrentMember, session: SessionDep) -> None:
    await debt_service.delete_debt(session, member, debt_id)
    await session.commit()


@router.post("/debts/{debt_id}/payments", status_code=status.HTTP_201_CREATED)
async def add_debt_payment(
    debt_id: UUID,
    body: CreateDebtPaymentRequest,
    member: CurrentMember,
    session: SessionDep,
) -> DebtResponse:
    _, payment = await debt_service.add_payment(
        session, member, debt_id, body.amount_minor, body.paid_on, body.note,
        body.payment_method,
    )
    await session.commit()
    currency = await _currency(session, member.household_id)
    rows = await debt_service.list_debts_with_figures(session, member.id)
    d, figures = next(row for row in rows if row[0].id == debt_id)
    response = debt_response(d, figures, currency)
    response.last_payment_id = payment.id
    return response


@router.delete(
    "/debts/{debt_id}/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_debt_payment(
    debt_id: UUID, payment_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await debt_service.delete_payment(session, member, debt_id, payment_id)
    await session.commit()
