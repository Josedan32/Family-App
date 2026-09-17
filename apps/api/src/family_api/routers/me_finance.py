from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.debt import Debt
from family_api.db.models.household import Household
from family_api.db.session import get_session
from family_api.periods import parse_period
from family_api.schemas.debt import (
    CreateDebtPaymentRequest,
    CreateDebtRequest,
    DebtDetailResponse,
    DebtPaymentResponse,
    DebtResponse,
)
from family_api.schemas.savings import (
    CreateEntryRequest,
    CreateGoalRequest,
    SavingsEntryResponse,
    SavingsGoalResponse,
)
from family_api.schemas.transaction import (
    CategoryRef,
    CreateTransactionRequest,
    TransactionListResponse,
    TransactionResponse,
    UpdateTransactionRequest,
)
from family_api.services import debts as debt_service
from family_api.services import savings as savings_service
from family_api.services import transactions as transaction_service
from family_api.services.installments import InstallmentFigures, compute_installments
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


@router.get("/savings-goals")
async def list_goals(member: CurrentMember, session: SessionDep) -> list[SavingsGoalResponse]:
    currency = await _currency(session, member.household_id)
    rows = await savings_service.list_goals_with_balances(session, member.id)
    return [
        SavingsGoalResponse(
            id=g.id, name=g.name, target_amount_minor=g.target_amount_minor,
            target_date=g.target_date, balance_minor=balance,
            progress=savings_service.progress(balance, g.target_amount_minor),
            currency=currency,
        )
        for g, balance in rows
    ]


@router.post("/savings-goals", status_code=status.HTTP_201_CREATED)
async def create_goal(
    body: CreateGoalRequest, member: CurrentMember, session: SessionDep
) -> SavingsGoalResponse:
    goal = await savings_service.create_goal(
        session, member, body.name, body.target_amount_minor, body.target_date
    )
    await session.commit()
    return SavingsGoalResponse(
        id=goal.id, name=goal.name, target_amount_minor=goal.target_amount_minor,
        target_date=goal.target_date, balance_minor=0, progress=0.0,
        currency=await _currency(session, member.household_id),
    )


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
    rows = await savings_service.list_goals_with_balances(session, member.id)
    goal, balance = next((g, b) for g, b in rows if g.id == goal_id)
    return SavingsGoalResponse(
        id=goal.id, name=goal.name, target_amount_minor=goal.target_amount_minor,
        target_date=goal.target_date, balance_minor=balance,
        progress=savings_service.progress(balance, goal.target_amount_minor),
        currency=await _currency(session, member.household_id),
    )


def _debt_response(
    debt: Debt, outstanding: int, figures: InstallmentFigures | None, currency: str
) -> DebtResponse:
    return DebtResponse(
        id=debt.id, creditor_type=debt.creditor_type, creditor_label=debt.creditor_label,
        principal_minor=debt.principal_minor, outstanding_minor=outstanding,
        annual_interest_rate=float(debt.annual_interest_rate)
        if debt.annual_interest_rate is not None else None,
        due_day=debt.due_day, status=debt.status, currency=currency,
        installments_total=figures.total if figures else None,
        installments_paid=figures.paid if figures else None,
        installments_remaining=figures.remaining if figures else None,
        next_installment_on=figures.next_on if figures else None,
        next_installment_amount_minor=figures.next_amount_minor if figures else None,
        is_overdue=figures.is_overdue if figures else None,
    )


@router.get("/debts")
async def list_debts(member: CurrentMember, session: SessionDep) -> list[DebtResponse]:
    currency = await _currency(session, member.household_id)
    rows = await debt_service.list_debts_with_figures(session, member.id)
    return [_debt_response(d, out, figures, currency) for d, out, figures in rows]


@router.post("/debts", status_code=status.HTTP_201_CREATED)
async def create_debt(
    body: CreateDebtRequest, member: CurrentMember, session: SessionDep
) -> DebtResponse:
    debt = await debt_service.create_debt(
        session, member, body.creditor_type, body.creditor_label,
        body.principal_minor, body.annual_interest_rate, body.due_day,
        body.installments_total, body.installment_amount_minor,
        body.first_installment_on,
    )
    await session.commit()
    currency = await _currency(session, member.household_id)
    rows = await debt_service.list_debts_with_figures(session, member.id)
    d, outstanding, figures = next(row for row in rows if row[0].id == debt.id)
    return _debt_response(d, outstanding, figures, currency)


@router.get("/debts/{debt_id}")
async def get_debt(
    debt_id: UUID, member: CurrentMember, session: SessionDep
) -> DebtDetailResponse:
    debt, outstanding, payments = await debt_service.get_debt_detail(session, member, debt_id)
    figures = compute_installments(
        debt.installments_total, debt.installment_amount_minor,
        debt.first_installment_on, debt.principal_minor - outstanding, date.today(),
    )
    currency = await _currency(session, member.household_id)
    base = _debt_response(debt, outstanding, figures, currency)
    return DebtDetailResponse(
        **base.model_dump(),
        payments=[
            DebtPaymentResponse(
                id=p.id, amount_minor=p.amount_minor, paid_on=p.paid_on, note=p.note
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
        session, member, debt_id, body.amount_minor, body.paid_on, body.note
    )
    await session.commit()
    currency = await _currency(session, member.household_id)
    rows = await debt_service.list_debts_with_figures(session, member.id)
    d, outstanding, figures = next(row for row in rows if row[0].id == debt_id)
    response = _debt_response(d, outstanding, figures, currency)
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
