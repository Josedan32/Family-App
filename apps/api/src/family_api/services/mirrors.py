"""Ledger rows that another module writes for you.

A contribution, a household expense a member paid, a savings withdrawal: each
is recorded in its own module and ALSO lands in the member's personal ledger,
so the month's income and expenses tell the truth. The ledger row is derived
(`source <> 'manual'`): the transactions API refuses to edit or delete it
(FR-M2-05), and it changes only through the record it mirrors.
"""

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.seeded import Category
from family_api.db.models.transaction import Transaction
from family_api.db.models.transaction_category import TransactionCategory
from family_api.ids import new_id


async def reserved_category(
    session: AsyncSession, household_id: UUID, kind: str, name: str
) -> Category:
    """The household's reserved category, created if an older household
    predates it."""
    category = await session.scalar(
        select(Category).where(
            Category.household_id == household_id,
            Category.kind == kind,
            Category.name == name,
        )
    )
    if category is None:
        category = Category(
            id=new_id(), household_id=household_id, kind=kind, name=name, is_system=True
        )
        session.add(category)
        await session.flush()
    return category


async def record_mirror(
    session: AsyncSession,
    *,
    household_id: UUID,
    member_id: UUID,
    kind: str,
    category_name: str,
    amount_minor: int,
    occurred_on: date,
    source: str,
    source_id: UUID,
    name: str | None = None,
) -> Transaction:
    category = await reserved_category(session, household_id, kind, category_name)
    transaction = Transaction(
        id=new_id(), household_id=household_id, member_id=member_id, kind=kind,
        category_id=category.id, amount_minor=amount_minor, occurred_on=occurred_on,
        name=name, source=source, source_id=source_id,
    )
    session.add(transaction)
    await session.flush()
    session.add(
        TransactionCategory(
            id=new_id(), household_id=household_id,
            transaction_id=transaction.id, category_id=category.id,
        )
    )
    await session.flush()
    return transaction
