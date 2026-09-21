"""The one derived number the whole module rests on.

Nothing here is stored. A stored balance would be a second source of truth for
fairness, and the first argument it lost would end the module's usefulness.
"""

import statistics
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import ChoreAssignment, EffortAdjustment, MemberAbsence
from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.user import User
from family_api.ids import new_id
from family_api.schemas.chore import EffortBalanceRow
from family_api.services.members import require_admin

ELIGIBLE_ROLES = ("admin", "adult", "teen")


def window_start(household: Household, today: date) -> date:
    return today - timedelta(days=household.effort_window_days)


async def eligible_members(
    session: AsyncSession, household_id: UUID
) -> list[HouseholdMember]:
    """Guests are never assigned chores (FR-M8-06)."""
    return list(
        await session.scalars(
            select(HouseholdMember).where(
                HouseholdMember.household_id == household_id,
                HouseholdMember.status == "active",
                HouseholdMember.role.in_(ELIGIBLE_ROLES),
            )
        )
    )


async def absent_member_ids(
    session: AsyncSession, household_id: UUID, on: date
) -> set[UUID]:
    rows = await session.scalars(
        select(MemberAbsence.member_id).where(
            MemberAbsence.household_id == household_id,
            MemberAbsence.starts_on <= on,
            MemberAbsence.ends_on >= on,
        )
    )
    return set(rows)


async def effort_balances(
    session: AsyncSession, household: Household, today: date | None = None
) -> dict[UUID, int]:
    """member_id -> effort points earned inside the rolling window.

    A member who joined after the window opened starts at the MEDIAN of the
    others (FR-M8-09). Starting at zero would hand every chore in the household
    to the newest person as a welcome gift.
    """
    today = today or date.today()
    start = window_start(household, today)
    start_ts = datetime.combine(start, datetime.min.time(), tzinfo=UTC)

    members = await eligible_members(session, household.id)

    completed_result = await session.execute(
        select(
            ChoreAssignment.completed_by_member_id,
            func.coalesce(func.sum(ChoreAssignment.effort_points), 0),
        )
        .where(
            ChoreAssignment.household_id == household.id,
            ChoreAssignment.status == "done",
            ChoreAssignment.completed_at >= start_ts,
        )
        .group_by(ChoreAssignment.completed_by_member_id)
    )
    completed: dict[UUID | None, int] = {row[0]: row[1] for row in completed_result}

    adjusted_result = await session.execute(
        select(
            EffortAdjustment.member_id,
            func.coalesce(func.sum(EffortAdjustment.points), 0),
        )
        .where(
            EffortAdjustment.household_id == household.id,
            EffortAdjustment.created_at >= start_ts,
        )
        .group_by(EffortAdjustment.member_id)
    )
    adjusted: dict[UUID, int] = {row[0]: row[1] for row in adjusted_result}

    balances = {
        m.id: int(completed.get(m.id, 0)) + int(adjusted.get(m.id, 0)) for m in members
    }

    established = [
        balances[m.id] for m in members if m.joined_at.date() <= start
    ]
    if established:
        median = int(statistics.median(established))
        for m in members:
            if m.joined_at.date() > start and balances[m.id] == 0:
                balances[m.id] = median

    return balances


async def create_adjustment(
    session: AsyncSession,
    member: HouseholdMember,
    target_member_id: UUID,
    points: int,
    reason: str,
) -> EffortAdjustment:
    """FR-M8-14: manual, attributed, auditable corrections only."""
    require_admin(member)
    adjustment = EffortAdjustment(
        id=new_id(), household_id=member.household_id, member_id=target_member_id,
        points=points, reason=reason, created_by_member_id=member.id,
    )
    session.add(adjustment)
    await session.flush()
    return adjustment


async def balance_rows(
    session: AsyncSession, household: Household, today: date | None = None
) -> list[EffortBalanceRow]:
    today = today or date.today()
    balances = await effort_balances(session, household, today)

    names_result = await session.execute(
        select(HouseholdMember.id, User.display_name).join(
            User, User.id == HouseholdMember.user_id
        )
    )
    names: dict[UUID, str] = {row[0]: row[1] for row in names_result}

    # Completed count follows the doer, same as effort_points (FR-M8-11).
    # Pending count has no doer yet, so it stays with the assignee.
    completed_result = await session.execute(
        select(ChoreAssignment.completed_by_member_id, func.count())
        .where(
            ChoreAssignment.household_id == household.id,
            ChoreAssignment.status == "done",
        )
        .group_by(ChoreAssignment.completed_by_member_id)
    )
    completed_counts: dict[UUID | None, int] = {row[0]: row[1] for row in completed_result}

    pending_result = await session.execute(
        select(ChoreAssignment.member_id, func.count())
        .where(
            ChoreAssignment.household_id == household.id,
            ChoreAssignment.status == "pending",
        )
        .group_by(ChoreAssignment.member_id)
    )
    pending_counts: dict[UUID, int] = {row[0]: row[1] for row in pending_result}

    # Household-visible (FR-M8-15): everyone sees who is away and when they
    # are due back, not just the absent member's own record.
    absences_result = await session.execute(
        select(MemberAbsence.member_id, func.max(MemberAbsence.ends_on))
        .where(
            MemberAbsence.household_id == household.id,
            MemberAbsence.starts_on <= today,
            MemberAbsence.ends_on >= today,
        )
        .group_by(MemberAbsence.member_id)
    )
    absent_until: dict[UUID, date] = {row[0]: row[1] for row in absences_result}

    return [
        EffortBalanceRow(
            member_id=member_id,
            display_name=names.get(member_id, ""),
            effort_points=points,
            completed_count=completed_counts.get(member_id, 0),
            pending_count=pending_counts.get(member_id, 0),
            absent_until=absent_until.get(member_id),
        )
        for member_id, points in sorted(balances.items(), key=lambda kv: -kv[1])
    ]
