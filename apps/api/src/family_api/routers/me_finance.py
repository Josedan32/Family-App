from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household
from family_api.db.session import get_session
from family_api.periods import parse_period
from family_api.schemas.transaction import (
    CreateTransactionRequest,
    TransactionListResponse,
    TransactionResponse,
    UpdateTransactionRequest,
)
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
                id=t.id, kind=t.kind, category_id=t.category_id, category_name=name,
                amount_minor=t.amount_minor, currency=currency,
                occurred_on=t.occurred_on, note=t.note, source=t.source,
            )
            for t, name in rows
        ],
        next_cursor=None,
    )


@router.post("/transactions", status_code=status.HTTP_201_CREATED)
async def create_transaction(
    body: CreateTransactionRequest, member: CurrentMember, session: SessionDep
) -> TransactionResponse:
    try:
        transaction = await transaction_service.create_transaction(
            session, member, body.kind, body.category_id,
            body.amount_minor, body.occurred_on, body.note,
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
    name = next(n for t, n in rows if t.id == transaction.id)
    return TransactionResponse(
        id=transaction.id, kind=transaction.kind, category_id=transaction.category_id,
        category_name=name, amount_minor=transaction.amount_minor,
        currency=await _currency(session, member.household_id),
        occurred_on=transaction.occurred_on, note=transaction.note,
        source=transaction.source,
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
            session, member, transaction_id, body.category_id,
            body.amount_minor, body.occurred_on, body.note,
        )
    except CategoryKindMismatchError:
        raise HTTPException(status_code=422, detail="Category kind mismatch") from None
    await session.commit()
    rows = await transaction_service.list_transactions(
        session, member.id, member.household_id, transaction.kind,
        transaction.occurred_on, transaction.occurred_on,
    )
    name = next(n for t, n in rows if t.id == transaction.id)
    return TransactionResponse(
        id=transaction.id, kind=transaction.kind, category_id=transaction.category_id,
        category_name=name, amount_minor=transaction.amount_minor,
        currency=await _currency(session, member.household_id),
        occurred_on=transaction.occurred_on, note=transaction.note,
        source=transaction.source,
    )


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await transaction_service.delete_transaction(session, member, transaction_id)
    await session.commit()
