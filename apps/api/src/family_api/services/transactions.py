from datetime import date
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.seeded import Category
from family_api.db.models.transaction import Transaction
from family_api.db.models.transaction_category import TransactionCategory
from family_api.errors import DerivedRecordError, NotFoundError
from family_api.ids import new_id


class CategoryKindMismatchError(Exception):
    """Raised as a 422 by the router. INV-D-04."""


async def _resolve_categories(
    session: AsyncSession, member: HouseholdMember, category_ids: list[UUID], kind: str
) -> list[Category]:
    """Validates every id belongs to the household and matches `kind`.
    Returns them in the caller's order, de-duplicated."""
    unique_ids = list(dict.fromkeys(category_ids))
    rows = list(
        await session.scalars(
            select(Category).where(
                Category.id.in_(unique_ids), Category.household_id == member.household_id
            )
        )
    )
    by_id = {c.id: c for c in rows}
    if len(by_id) != len(unique_ids):
        raise NotFoundError
    for category in rows:
        if category.kind != kind:
            raise CategoryKindMismatchError
    return [by_id[cid] for cid in unique_ids]


async def _link_categories(
    session: AsyncSession, household_id: UUID, transaction_id: UUID, categories: list[Category]
) -> None:
    for category in categories:
        session.add(
            TransactionCategory(
                id=new_id(), household_id=household_id,
                transaction_id=transaction_id, category_id=category.id,
            )
        )
    await session.flush()


async def create_transaction(
    session: AsyncSession,
    member: HouseholdMember,
    kind: str,
    category_ids: list[UUID],
    amount_minor: int,
    occurred_on: date,
    name: str | None = None,
    note: str | None = None,
    is_recurring: bool = False,
    frequency: str | None = None,
    payment_method: str = "cash",
) -> Transaction:
    """The owner is always the caller. A member cannot write into another's ledger."""
    categories = await _resolve_categories(session, member, category_ids, kind)
    transaction = Transaction(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        kind=kind, category_id=categories[0].id, amount_minor=amount_minor,
        occurred_on=occurred_on, name=name, note=note, source="manual",
        is_recurring=is_recurring, frequency=frequency, payment_method=payment_method,
    )
    session.add(transaction)
    await session.flush()
    await _link_categories(session, member.household_id, transaction.id, categories)
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
) -> list[tuple[Transaction, list[tuple[UUID, str]]]]:
    stmt = select(Transaction.id).where(
        Transaction.household_id == household_id,
        Transaction.member_id == member_id,
        Transaction.occurred_on >= start,
        Transaction.occurred_on <= end,
    )
    if kind is not None:
        stmt = stmt.where(Transaction.kind == kind)
    if category_id is not None:
        # Matches ANY of the transaction's categories, not only the primary one.
        stmt = stmt.where(
            Transaction.id.in_(
                select(TransactionCategory.transaction_id).where(
                    TransactionCategory.category_id == category_id
                )
            )
        )
    stmt = stmt.order_by(Transaction.occurred_on.desc(), Transaction.id.desc()).limit(limit)
    ids = list(await session.scalars(stmt))
    if not ids:
        return []

    transactions = {
        t.id: t
        for t in await session.scalars(select(Transaction).where(Transaction.id.in_(ids)))
    }
    category_rows = (
        await session.execute(
            select(TransactionCategory.transaction_id, Category.id, Category.name)
            .join(Category, Category.id == TransactionCategory.category_id)
            .where(TransactionCategory.transaction_id.in_(ids))
        )
    ).all()
    categories_by_tx: dict[UUID, list[tuple[UUID, str]]] = {}
    for transaction_id, cat_id, cat_name in category_rows:
        categories_by_tx.setdefault(transaction_id, []).append((cat_id, cat_name))

    return [(transactions[tid], categories_by_tx.get(tid, [])) for tid in ids]


async def total_for(
    session: AsyncSession, member_id: UUID, kind: str, start: date, end: date
) -> int:
    """Computed in the database, in integers. Never in Python floats.

    One row per transaction regardless of how many categories it carries, so
    a multi-category transaction is never double-counted here.
    """
    total = await session.scalar(
        select(func.coalesce(func.sum(Transaction.amount_minor), 0)).where(
            Transaction.member_id == member_id,
            Transaction.kind == kind,
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        )
    )
    return int(total or 0)


async def category_breakdown_for(
    session: AsyncSession, member_id: UUID, kind: str, start: date, end: date
) -> list[tuple[str, int]]:
    """One member's transactions of `kind`, summed per category.

    A transaction carrying more than one category (Task 9) contributes its
    full amount to EACH of its categories, so rows here can sum to more than
    `total_for(...)`. This is a deliberate choice, made on its own merits,
    not because some other query already does it this way:

    - The alternative — splitting the amount across categories — would
      invent an allocation the data does not record. A $100 transaction
      tagged "Comida" and "Hogar" was never split 50/50, or any other ratio;
      manufacturing one would misrepresent the household's spending.
    - This is a breakdown that answers "how much went toward category X",
      not a partition of the total that must reconcile to it. The caller
      (the dashboard) surfaces this to the viewer alongside the plain total,
      so the discrepancy is visible rather than silently absorbed here.
    """
    rows = (
        await session.execute(
            select(Category.name, func.coalesce(func.sum(Transaction.amount_minor), 0))
            .join(TransactionCategory, TransactionCategory.transaction_id == Transaction.id)
            .join(Category, Category.id == TransactionCategory.category_id)
            .where(
                Transaction.member_id == member_id,
                Transaction.kind == kind,
                Transaction.occurred_on >= start,
                Transaction.occurred_on <= end,
            )
            .group_by(Category.name)
            .order_by(func.sum(Transaction.amount_minor).desc())
        )
    ).all()
    return [(name, int(total)) for name, total in rows]


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
    category_ids: list[UUID] | None,
    amount_minor: int | None,
    occurred_on: date | None,
    name: str | None,
    note: str | None,
) -> Transaction:
    transaction = await _own_transaction(session, member, transaction_id)
    if category_ids is not None:
        categories = await _resolve_categories(session, member, category_ids, transaction.kind)
        transaction.category_id = categories[0].id
        await session.execute(
            delete(TransactionCategory).where(
                TransactionCategory.transaction_id == transaction.id
            )
        )
        await session.flush()
        await _link_categories(session, member.household_id, transaction.id, categories)
    if amount_minor is not None:
        transaction.amount_minor = amount_minor
    if occurred_on is not None:
        transaction.occurred_on = occurred_on
    if name is not None:
        transaction.name = name
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
