"""Assignment by lowest accumulated effort.

NOT a rotation. Round-robin was rejected because it ignores that mopping costs
more than taking out the rubbish, and random was rejected because it permits
exactly the "10 chores versus 2" outcome the module exists to prevent.
"""

import random
import secrets
from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import Chore, ChoreAssignment, ChoreCycle
from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.user import User
from family_api.errors import DomainError, ForbiddenRoleError, NotFoundError
from family_api.ids import new_id
from family_api.recurrence import occurrences
from family_api.schemas.chore import AssignmentResponse
from family_api.services.absences import absent_member_ids
from family_api.services.chores import list_chores
from family_api.services.effort import effort_balances, eligible_members
from family_api.services.members import require_admin


class CycleExistsError(DomainError):
    type_slug = "cycle_exists"
    status = 409
    title = "Ya existe un ciclo que empieza ese día"


def choose_assignee(
    candidates: list[UUID], balances: dict[UUID, int], rng: random.Random
) -> UUID:
    """Lowest balance wins; ties are broken at random.

    The random tie-break is not decoration. Sorting by name or join date hands
    the same person the same chore every cycle, forever (FR-M8-07).
    """
    if not candidates:
        raise ValueError("No eligible members to assign to")
    lowest = min(balances.get(c, 0) for c in candidates)
    tied = [c for c in candidates if balances.get(c, 0) == lowest]
    return rng.choice(tied)


async def generate_cycle(
    session: AsyncSession,
    member: HouseholdMember,
    starts_on: date,
    ends_on: date,
    seed: int | None = None,
) -> ChoreCycle:
    """Draw a cycle's assignments, recording the seed that produced them.

    The seed is persisted (FR-M8-17) so the draw is reproducible: the wheel
    replays the identical spin for every viewer, and the same seed re-run
    yields the same assignments.
    """
    require_admin(member)
    if seed is None:
        seed = secrets.randbits(48)
    rng = random.Random(seed)

    household = await session.get(Household, member.household_id)
    assert household is not None

    cycle = ChoreCycle(
        id=new_id(), household_id=household.id, starts_on=starts_on,
        ends_on=ends_on, seed=seed,
    )
    session.add(cycle)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise CycleExistsError from exc

    chores = await list_chores(session, member)
    members = await eligible_members(session, household.id)
    balances = await effort_balances(session, household, starts_on)

    # Build every occurrence first, then walk them in date order, so a chore due
    # on the 1st is assigned before one due on the 5th and the provisional
    # balance updates spread work across the cycle instead of piling it on
    # whoever started lowest.
    slots: list[tuple[Chore, date]] = []
    for chore in chores:
        for due_on in occurrences(chore.frequency, starts_on, ends_on):
            slots.append((chore, due_on))
    slots.sort(key=lambda slot: slot[1])

    for chore, due_on in slots:
        absent = await absent_member_ids(session, household.id, due_on)
        candidates = [m.id for m in members if m.id not in absent]
        if not candidates:
            # Everyone is away. Record it rather than silently dropping the chore.
            session.add(
                ChoreAssignment(
                    id=new_id(), household_id=household.id, cycle_id=cycle.id,
                    chore_id=chore.id, member_id=members[0].id, due_on=due_on,
                    status="skipped", effort_points=chore.effort_points,
                )
            )
            continue

        chosen = choose_assignee(candidates, balances, rng)
        session.add(
            ChoreAssignment(
                id=new_id(), household_id=household.id, cycle_id=cycle.id,
                chore_id=chore.id, member_id=chosen, due_on=due_on,
                status="pending",
                # Frozen now (FR-M8-04).
                effort_points=chore.effort_points,
            )
        )
        # Provisional: assume it gets done, so the next slot goes elsewhere.
        balances[chosen] = balances.get(chosen, 0) + chore.effort_points

    await session.flush()
    return cycle


async def current_cycle(
    session: AsyncSession, household_id: UUID, on: date | None = None
) -> ChoreCycle | None:
    on = on or date.today()
    cycle = await session.scalar(
        select(ChoreCycle)
        .where(
            ChoreCycle.household_id == household_id,
            ChoreCycle.starts_on <= on,
            ChoreCycle.ends_on >= on,
        )
        .order_by(ChoreCycle.starts_on.desc())
    )
    return cycle


async def _load_assignment(
    session: AsyncSession, member: HouseholdMember, assignment_id: UUID
) -> ChoreAssignment:
    assignment = await session.scalar(
        select(ChoreAssignment).where(
            ChoreAssignment.id == assignment_id,
            ChoreAssignment.household_id == member.household_id,
        )
    )
    if assignment is None:
        raise NotFoundError
    return assignment


async def complete_assignment(
    session: AsyncSession, member: HouseholdMember, assignment_id: UUID
) -> ChoreAssignment:
    assignment = await _load_assignment(session, member, assignment_id)
    if assignment.member_id != member.id and member.role != "admin":
        raise ForbiddenRoleError
    assignment.status = "done"
    assignment.completed_at = datetime.now(UTC)
    # Credit follows whoever actually did it (FR-M8-11).
    assignment.completed_by_member_id = member.id
    await session.flush()
    return assignment


async def reassign_assignment(
    session: AsyncSession,
    member: HouseholdMember,
    assignment_id: UUID,
    new_member_id: UUID,
) -> ChoreAssignment:
    assignment = await _load_assignment(session, member, assignment_id)
    if assignment.member_id != member.id and member.role != "admin":
        raise ForbiddenRoleError

    target = await session.get(HouseholdMember, new_member_id)
    if target is None or target.household_id != member.household_id:
        raise NotFoundError
    if target.role == "guest":
        raise ForbiddenRoleError

    assignment.member_id = target.id
    await session.flush()
    return assignment


async def list_cycle_assignments(
    session: AsyncSession, cycle_id: UUID, member_id: UUID | None = None
) -> list[ChoreAssignment]:
    stmt = select(ChoreAssignment).where(ChoreAssignment.cycle_id == cycle_id)
    if member_id is not None:
        stmt = stmt.where(ChoreAssignment.member_id == member_id)
    return list(await session.scalars(stmt.order_by(ChoreAssignment.due_on)))


async def to_assignment_responses(
    session: AsyncSession, assignments: list[ChoreAssignment]
) -> list[AssignmentResponse]:
    if not assignments:
        return []

    chore_ids = {a.chore_id for a in assignments}
    member_ids = {a.member_id for a in assignments}
    # One batched read for the whole catalogue — never a query per row.
    chore_rows = await session.execute(
        select(
            Chore.id, Chore.name, Chore.activities, Chore.requirements, Chore.expectation
        ).where(Chore.id.in_(chore_ids))
    )
    chores: dict[UUID, tuple[str, list[str], list[str], str | None]] = {
        row[0]: (row[1], row[2], row[3], row[4]) for row in chore_rows
    }
    EMPTY: tuple[str, list[str], list[str], str | None] = ("", [], [], None)

    member_names_result = await session.execute(
        select(HouseholdMember.id, User.display_name)
        .join(User, User.id == HouseholdMember.user_id)
        .where(HouseholdMember.id.in_(member_ids))
    )
    member_names: dict[UUID, str] = {row[0]: row[1] for row in member_names_result}

    return [
        AssignmentResponse(
            id=a.id, chore_id=a.chore_id,
            chore_name=chores.get(a.chore_id, EMPTY)[0],
            chore_activities=chores.get(a.chore_id, EMPTY)[1],
            chore_requirements=chores.get(a.chore_id, EMPTY)[2],
            chore_expectation=chores.get(a.chore_id, EMPTY)[3],
            member_id=a.member_id, member_name=member_names.get(a.member_id, ""),
            due_on=a.due_on, status=a.status, effort_points=a.effort_points,
            completed_at=a.completed_at, completed_by_member_id=a.completed_by_member_id,
        )
        for a in assignments
    ]
