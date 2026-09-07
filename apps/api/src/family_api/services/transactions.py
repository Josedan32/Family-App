from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.seeded import Category
from family_api.db.models.transaction import Transaction
from family_api.errors import DerivedRecordError, NotFoundError
from family_api.ids import new_id


class CategoryKindMismatchError(Exception):
    """Raised as a 422 by the router. INV-D-04."""


async def _resolve_category(
    session: AsyncSession, member: HouseholdMember, category_id: UUID, kind: str
) -> Category:
    category = await session.scalar(
        select(Category).where(
            Category.id == category_id, Category.household_id == member.household_id
        )
    )
    if category is None:
        raise NotFoundError
    if category.kind != kind:
        raise CategoryKindMismatchError
    return category


async def create_transaction(
    session: AsyncSession,
    member: HouseholdMember,
    kind: str,
    category_id: UUID,
    amount_minor: int,
    occurred_on: date,
    note: str | None = None,
) -> Transaction:
    """The owner is always the caller. A member cannot write into another's ledger."""
    await _resolve_category(session, member, category_id, kind)
    transaction = Transaction(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        kind=kind, category_id=category_id, amount_minor=amount_minor,
        occurred_on=occurred_on, note=note, source="manual",
    )
    session.add(transaction)
    await session.flush()
    return transaction


async def list_transactions(
    session: AsyncSession,
    member_id: UUID,
    household_id: UUID,
    kind: str | None,
    start: date,
    end: date,
    category_id: UUID | None = None,
    limit: int = 50,
) -> list[tuple[Transaction, str]]:
    stmt = (
        select(Transaction, Category.name)
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.household_id == household_id,
            Transaction.member_id == member_id,
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        )
    )
    if kind is not None:
        stmt = stmt.where(Transaction.kind == kind)
    if category_id is not None:
        stmt = stmt.where(Transaction.category_id == category_id)
    stmt = stmt.order_by(Transaction.occurred_on.desc(), Transaction.id.desc()).limit(limit)
    return [(t, name) for t, name in (await session.execute(stmt)).all()]


async def total_for(
    session: AsyncSession, member_id: UUID, kind: str, start: date, end: date
) -> int:
    """Computed in the database, in integers. Never in Python floats."""
    total = await session.scalar(
        select(func.coalesce(func.sum(Transaction.amount_minor), 0)).where(
            Transaction.member_id == member_id,
            Transaction.kind == kind,
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        )
    )
    return int(total or 0)


async def _own_transaction(
    session: AsyncSession, member: HouseholdMember, transaction_id: UUID
) -> Transaction:
    transaction = await session.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id, Transaction.member_id == member.id
        )
    )
    if transaction is None:
        # 404, not 403: to this member the row does not exist in their ledger.
        raise NotFoundError
    if transaction.source != "manual":
        raise DerivedRecordError
    return transaction


async def update_transaction(
    session: AsyncSession,
    member: HouseholdMember,
    transaction_id: UUID,
    category_id: UUID | None,
    amount_minor: int | None,
    occurred_on: date | None,
    note: str | None,
) -> Transaction:
    transaction = await _own_transaction(session, member, transaction_id)
    if category_id is not None:
        await _resolve_category(session, member, category_id, transaction.kind)
        transaction.category_id = category_id
    if amount_minor is not None:
        transaction.amount_minor = amount_minor
    if occurred_on is not None:
        transaction.occurred_on = occurred_on
    if note is not None:
        transaction.note = note
    await session.flush()
    return transaction


async def delete_transaction(
    session: AsyncSession, member: HouseholdMember, transaction_id: UUID
) -> None:
    transaction = await _own_transaction(session, member, transaction_id)
    await session.delete(transaction)
    await session.flush()
