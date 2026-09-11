from datetime import date
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.contribution import (
    Contribution, ContributionPeriod, ContributionPledge,
)
from family_api.db.models.household import HouseholdMember
from family_api.errors import DomainError, NotFoundError
from family_api.ids import new_id
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
    return await session.scalar(
        select(ContributionPeriod)
        .where(
            ContributionPeriod.household_id == household_id,
            ContributionPeriod.status == "open",
        )
        .order_by(ContributionPeriod.period_month.desc())
    )


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
