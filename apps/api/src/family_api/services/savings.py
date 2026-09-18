from datetime import date
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.savings import SavingsEntry, SavingsGoal
from family_api.errors import DomainError, NotFoundError
from family_api.ids import new_id


class GoalNotReachedError(DomainError):
    type_slug = "goal_not_reached"
    status = 409
    title = "Solo una meta alcanzada se puede marcar como usada"


class GoalUsedError(DomainError):
    type_slug = "goal_used"
    status = 409
    title = "Esta meta ya se usó y no recibe más movimientos"

_SIGNED_AMOUNT = case(
    (SavingsEntry.kind == "deposit", SavingsEntry.amount_minor),
    else_=-SavingsEntry.amount_minor,
)


async def create_goal(
    session: AsyncSession,
    member: HouseholdMember,
    name: str,
    target_amount_minor: int,
    target_date: date | None,
    priority: str = "media",
) -> SavingsGoal:
    goal = SavingsGoal(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        name=name, target_amount_minor=target_amount_minor, target_date=target_date,
        priority=priority,
    )
    session.add(goal)
    await session.flush()
    return goal


async def list_goals_with_balances(
    session: AsyncSession, member_id: UUID
) -> list[tuple[SavingsGoal, int]]:
    stmt = (
        select(SavingsGoal, func.coalesce(func.sum(_SIGNED_AMOUNT), 0))
        .outerjoin(SavingsEntry, SavingsEntry.goal_id == SavingsGoal.id)
        .where(SavingsGoal.member_id == member_id, SavingsGoal.archived_at.is_(None))
        .group_by(SavingsGoal.id)
        # Used goals are history: they sink below the ones still being saved for.
        .order_by(SavingsGoal.used_on.is_not(None), SavingsGoal.name)
    )
    return [(goal, int(balance or 0)) for goal, balance in (await session.execute(stmt)).all()]


async def deposits_in_period(
    session: AsyncSession, member_id: UUID, start: date, end: date
) -> int:
    """Sum of deposit entries within the period, never netted against
    withdrawals — "total saved that month" is what went in, not the running
    balance (that is `total_balance`)."""
    total = await session.scalar(
        select(func.coalesce(func.sum(SavingsEntry.amount_minor), 0))
        .select_from(SavingsEntry)
        .join(SavingsGoal, SavingsGoal.id == SavingsEntry.goal_id)
        .where(
            SavingsGoal.member_id == member_id,
            SavingsEntry.kind == "deposit",
            SavingsEntry.occurred_on >= start,
            SavingsEntry.occurred_on <= end,
        )
    )
    return int(total or 0)


async def total_balance(session: AsyncSession, member_id: UUID) -> int:
    """The single number the savings summary returns.

    A used goal's money was spent on its purpose, so it is no longer saved.
    """
    total = await session.scalar(
        select(func.coalesce(func.sum(_SIGNED_AMOUNT), 0))
        .select_from(SavingsEntry)
        .join(SavingsGoal, SavingsGoal.id == SavingsEntry.goal_id)
        .where(SavingsGoal.member_id == member_id, SavingsGoal.used_on.is_(None))
    )
    return int(total or 0)


async def _own_goal(
    session: AsyncSession, member: HouseholdMember, goal_id: UUID
) -> SavingsGoal:
    goal = await session.scalar(
        select(SavingsGoal).where(
            SavingsGoal.id == goal_id, SavingsGoal.member_id == member.id
        )
    )
    if goal is None:
        raise NotFoundError
    return goal


async def list_entries(
    session: AsyncSession, member: HouseholdMember, goal_id: UUID
) -> list[SavingsEntry]:
    await _own_goal(session, member, goal_id)
    stmt = (
        select(SavingsEntry)
        .where(SavingsEntry.goal_id == goal_id)
        .order_by(SavingsEntry.occurred_on.desc(), SavingsEntry.id.desc())
    )
    return list(await session.scalars(stmt))


async def add_entry(
    session: AsyncSession,
    member: HouseholdMember,
    goal_id: UUID,
    kind: str,
    amount_minor: int,
    occurred_on: date,
    note: str | None,
) -> SavingsEntry:
    goal = await _own_goal(session, member, goal_id)
    if goal.used_on is not None:
        raise GoalUsedError
    entry = SavingsEntry(
        id=new_id(), household_id=goal.household_id, goal_id=goal.id,
        kind=kind, amount_minor=amount_minor, occurred_on=occurred_on, note=note,
    )
    session.add(entry)
    await session.flush()
    return entry


async def _goal_balance(session: AsyncSession, goal_id: UUID) -> int:
    balance = await session.scalar(
        select(func.coalesce(func.sum(_SIGNED_AMOUNT), 0)).where(SavingsEntry.goal_id == goal_id)
    )
    return int(balance or 0)


async def mark_goal_used(
    session: AsyncSession, member: HouseholdMember, goal_id: UUID, used_on: date
) -> SavingsGoal:
    goal = await _own_goal(session, member, goal_id)
    if await _goal_balance(session, goal.id) < goal.target_amount_minor:
        raise GoalNotReachedError
    goal.used_on = used_on
    await session.flush()
    return goal


async def unmark_goal_used(
    session: AsyncSession, member: HouseholdMember, goal_id: UUID
) -> SavingsGoal:
    goal = await _own_goal(session, member, goal_id)
    goal.used_on = None
    await session.flush()
    return goal


def progress(balance_minor: int, target_amount_minor: int) -> float:
    """Reported truthfully, including above 1.0. The client caps the display."""
    if target_amount_minor <= 0:
        return 0.0
    return balance_minor / target_amount_minor


def goal_state(
    balance_minor: int,
    target_amount_minor: int,
    target_date: date | None,
    today: date,
    used_on: date | None = None,
) -> tuple[str, int | None, bool]:
    """Derive (state, days_remaining, is_overdue). Never stored.

    Precedence: used > goal achieved > deadline passed > "N days left". A used
    goal has no deadline left to count down or miss. `state` is
    `completado` exactly when the balance meets the target, regardless of
    the date — an achieved goal is never "overdue". `days_remaining` is the
    raw signed day count against `target_date` (negative once it has
    passed); `is_overdue` is only true for a goal that is both unmet and
    past its deadline.
    """
    if used_on is not None:
        return "usada", None, False
    achieved = balance_minor >= target_amount_minor
    state = "completado" if achieved else "en_progreso"
    if target_date is None:
        return state, None, False
    days_remaining = (target_date - today).days
    is_overdue = not achieved and days_remaining < 0
    return state, days_remaining, is_overdue
