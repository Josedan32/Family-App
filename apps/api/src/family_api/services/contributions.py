from datetime import date
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.contribution import (
    Contribution,
    ContributionPeriod,
    ContributionPledge,
)
from family_api.db.models.household import HouseholdMember
from family_api.db.models.seeded import Category
from family_api.db.models.transaction import Transaction
from family_api.db.models.transaction_category import TransactionCategory
from family_api.errors import DomainError, ForbiddenRoleError, NotFoundError
from family_api.ids import new_id
from family_api.services.households import CONTRIBUTION_CATEGORY
from family_api.services.members import require_admin


class PeriodClosedError(DomainError):
    type_slug = "period_closed"
    status = 409
    title = "El periodo está cerrado"


class PeriodExistsError(DomainError):
    type_slug = "period_exists"
    status = 409
    title = "Ya existe un periodo para ese mes"


async def open_period(
    session: AsyncSession,
    member: HouseholdMember,
    period_month: date,
    goal_amount_minor: int,
) -> ContributionPeriod:
    require_admin(member)
    period = ContributionPeriod(
        id=new_id(), household_id=member.household_id,
        period_month=period_month.replace(day=1),
        goal_amount_minor=goal_amount_minor, status="open",
    )
    session.add(period)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise PeriodExistsError from exc
    return period


async def list_periods(
    session: AsyncSession, member: HouseholdMember, status: str | None = None
) -> list[ContributionPeriod]:
    stmt = select(ContributionPeriod).where(
        ContributionPeriod.household_id == member.household_id
    )
    if status is not None:
        stmt = stmt.where(ContributionPeriod.status == status)
    return list(
        await session.scalars(stmt.order_by(ContributionPeriod.period_month.desc()))
    )


async def get_open_period(
    session: AsyncSession, household_id: UUID
) -> ContributionPeriod | None:
    period = await session.scalar(
        select(ContributionPeriod)
        .where(
            ContributionPeriod.household_id == household_id,
            ContributionPeriod.status == "open",
        )
        .order_by(ContributionPeriod.period_month.desc())
    )
    return period


async def _load_period(
    session: AsyncSession, member: HouseholdMember, period_id: UUID
) -> ContributionPeriod:
    period = await session.scalar(
        select(ContributionPeriod).where(
            ContributionPeriod.id == period_id,
            ContributionPeriod.household_id == member.household_id,
        )
    )
    if period is None:
        raise NotFoundError
    return period


async def update_period(
    session: AsyncSession,
    member: HouseholdMember,
    period_id: UUID,
    goal_amount_minor: int | None,
) -> ContributionPeriod:
    require_admin(member)
    period = await _load_period(session, member, period_id)
    if period.status == "closed":
        raise PeriodClosedError
    if goal_amount_minor is not None:
        period.goal_amount_minor = goal_amount_minor
    await session.flush()
    return period


async def close_period(
    session: AsyncSession, member: HouseholdMember, period_id: UUID
) -> ContributionPeriod:
    require_admin(member)
    period = await _load_period(session, member, period_id)
    period.status = "closed"
    await session.flush()
    return period


async def set_pledges(
    session: AsyncSession,
    member: HouseholdMember,
    period_id: UUID,
    pledges: list[tuple[UUID, int]],
) -> None:
    """Replaces the whole set. A PUT of an empty list clears all pledges."""
    require_admin(member)
    period = await _load_period(session, member, period_id)
    if period.status == "closed":
        raise PeriodClosedError

    await session.execute(
        delete(ContributionPledge).where(ContributionPledge.period_id == period.id)
    )
    for member_id, expected in pledges:
        session.add(
            ContributionPledge(
                id=new_id(), household_id=period.household_id, period_id=period.id,
                member_id=member_id, expected_amount_minor=expected,
            )
        )
    await session.flush()


async def period_totals(
    session: AsyncSession, period_id: UUID
) -> tuple[int, dict[UUID, int], dict[UUID, int]]:
    """Returns (collected, contributed_by_member, pledged_by_member)."""
    collected = await session.scalar(
        select(func.coalesce(func.sum(Contribution.amount_minor), 0)).where(
            Contribution.period_id == period_id
        )
    )
    contributed_rows = (
        await session.execute(
            select(Contribution.member_id, func.sum(Contribution.amount_minor))
            .where(Contribution.period_id == period_id)
            .group_by(Contribution.member_id)
        )
    ).all()
    pledged_rows = (
        await session.execute(
            select(ContributionPledge.member_id, ContributionPledge.expected_amount_minor)
            .where(ContributionPledge.period_id == period_id)
        )
    ).all()
    return (
        int(collected or 0),
        {member_id: int(total) for member_id, total in contributed_rows},
        {member_id: int(expected) for member_id, expected in pledged_rows},
    )


async def record_contribution(
    session: AsyncSession,
    member: HouseholdMember,
    period_id: UUID,
    amount_minor: int,
    paid_on: date,
    note: str | None,
) -> Contribution:
    """Write the contribution AND the contributor's personal expense atomically.

    INV-D-01 / FR-M4-05: either both rows exist or neither does. The caller
    commits; every write below is inside that one transaction, so an error
    anywhere rolls back both.
    """
    if member.role == "guest":
        raise ForbiddenRoleError

    period = await _load_period(session, member, period_id)
    if period.status == "closed":
        raise PeriodClosedError

    category = await session.scalar(
        select(Category).where(
            Category.household_id == member.household_id,
            Category.kind == "expense",
            Category.name == CONTRIBUTION_CATEGORY,
        )
    )
    if category is None:
        raise NotFoundError

    contribution_id = new_id()
    transaction = Transaction(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        kind="expense", category_id=category.id, amount_minor=amount_minor,
        occurred_on=paid_on, note=note,
        source="contribution", source_id=contribution_id,
    )
    session.add(transaction)
    await session.flush()
    session.add(
        TransactionCategory(
            id=new_id(), household_id=member.household_id,
            transaction_id=transaction.id, category_id=category.id,
        )
    )
    await session.flush()

    contribution = Contribution(
        id=contribution_id, household_id=member.household_id, period_id=period.id,
        member_id=member.id, amount_minor=amount_minor, paid_on=paid_on, note=note,
        expense_transaction_id=transaction.id,
    )
    session.add(contribution)
    await session.flush()
    return contribution


async def list_own_contributions(
    session: AsyncSession, member: HouseholdMember, period_id: UUID
) -> list[Contribution]:
    period = await _load_period(session, member, period_id)
    stmt = (
        select(Contribution)
        .where(Contribution.period_id == period.id, Contribution.member_id == member.id)
        .order_by(Contribution.paid_on.desc())
    )
    return list(await session.scalars(stmt))


async def update_contribution(
    session: AsyncSession,
    actor: HouseholdMember,
    contribution_id: UUID,
    amount_minor: int | None,
    paid_on: date | None,
    note: str | None,
) -> Contribution:
    """Updates the contribution AND its mirrored expense atomically — same
    discipline as `record_contribution` (INV-D-01): one write, both rows."""
    contribution = await session.scalar(
        select(Contribution).where(
            Contribution.id == contribution_id,
            Contribution.household_id == actor.household_id,
        )
    )
    if contribution is None:
        raise NotFoundError
    if contribution.member_id != actor.id and actor.role != "admin":
        raise ForbiddenRoleError

    period = await session.get(ContributionPeriod, contribution.period_id)
    assert period is not None
    if period.status == "closed":
        raise PeriodClosedError

    transaction = await session.get(Transaction, contribution.expense_transaction_id)
    assert transaction is not None

    if amount_minor is not None:
        contribution.amount_minor = amount_minor
        transaction.amount_minor = amount_minor
    if paid_on is not None:
        contribution.paid_on = paid_on
        transaction.occurred_on = paid_on
    if note is not None:
        contribution.note = note
        transaction.note = note

    await session.flush()
    return contribution


async def delete_contribution(
    session: AsyncSession, actor: HouseholdMember, contribution_id: UUID
) -> None:
    """Removes the contribution and its mirrored expense atomically (FR-M4-06).

    Order matters: the contribution holds an ON DELETE RESTRICT FK to the
    transaction, so the contribution must go first.
    """
    contribution = await session.scalar(
        select(Contribution).where(
            Contribution.id == contribution_id,
            Contribution.household_id == actor.household_id,
        )
    )
    if contribution is None:
        raise NotFoundError
    if contribution.member_id != actor.id and actor.role != "admin":
        raise ForbiddenRoleError

    transaction_id = contribution.expense_transaction_id
    await session.delete(contribution)
    await session.flush()

    transaction = await session.get(Transaction, transaction_id)
    if transaction is not None:
        await session.delete(transaction)
    await session.flush()
