"""C-05 and C-06.

Compensation is emergent: an absent member earns nothing while away, so their
balance stays flat and the ordinary rule assigns them more on return. There is
deliberately no effort-debt table to check.
"""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import ChoreAssignment, MemberAbsence
from family_api.ids import new_id
from family_api.services.absences import create_absence
from family_api.services.assignment import generate_cycle
from family_api.services.chores import create_chore
from family_api.services.effort import create_adjustment
from tests.integration.test_fairness import _complete_everything, _household_of_four


@pytest.mark.asyncio
async def test_an_absent_member_is_never_assigned_in_range(
    db_session: AsyncSession,
) -> None:
    """C-05 / INV-D-11."""
    household, members = await _household_of_four(db_session)
    papa = members[1]
    db_session.add(
        MemberAbsence(
            id=new_id(), household_id=household.id, member_id=papa.id,
            starts_on=date(2026, 9, 1), ends_on=date(2026, 9, 14), reason="Viaje",
        )
    )
    await db_session.flush()

    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 14),
        seed=11,
    )

    assigned = {
        a.member_id
        for a in (
            await db_session.scalars(
                select(ChoreAssignment).where(
                    ChoreAssignment.household_id == household.id
                )
            )
        ).all()
    }
    assert papa.id not in assigned


@pytest.mark.asyncio
async def test_the_returning_member_catches_up_without_a_debt_table(
    db_session: AsyncSession,
) -> None:
    """C-06 / FR-M8-13."""
    household, members = await _household_of_four(db_session)
    papa = members[1]
    db_session.add(
        MemberAbsence(
            id=new_id(), household_id=household.id, member_id=papa.id,
            starts_on=date(2026, 9, 1), ends_on=date(2026, 9, 14),
        )
    )
    await db_session.flush()

    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 14),
        seed=13,
    )
    await _complete_everything(db_session, household.id)

    await generate_cycle(
        db_session, members[0], date(2026, 9, 15), date(2026, 9, 28),
        seed=17,
    )

    second = (
        await db_session.scalars(
            select(ChoreAssignment).where(ChoreAssignment.due_on >= date(2026, 9, 15))
        )
    ).all()
    counts: dict = {}
    for assignment in second:
        counts[assignment.member_id] = counts.get(assignment.member_id, 0) + 1

    assert counts.get(papa.id, 0) == max(counts.values())


@pytest.mark.asyncio
async def test_no_effort_debt_table_exists() -> None:
    """The compensation mechanism must stay emergent."""
    from family_api.db import models

    assert not hasattr(models, "EffortDebt")


# ------------------------------------------------ declaring an absence mid-cycle
#
# FR-M8-12: an absent member's occurrences go to the next-lowest-balance
# member. A cycle drawn before the absence was declared already holds their
# chores, so declaring it has to hand them over, not just affect the next draw.

AWAY_FROM, AWAY_TO = date(2026, 9, 5), date(2026, 9, 10)


async def _assignments(session: AsyncSession, household_id) -> list[ChoreAssignment]:
    return list(
        (
            await session.scalars(
                select(ChoreAssignment).where(ChoreAssignment.household_id == household_id)
            )
        ).all()
    )


def _in_range(assignment: ChoreAssignment) -> bool:
    return AWAY_FROM <= assignment.due_on <= AWAY_TO


async def _drawn_household(session: AsyncSession):
    household, members = await _household_of_four(session)
    await generate_cycle(session, members[0], date(2026, 9, 1), date(2026, 9, 14), seed=5)
    return household, members


@pytest.mark.asyncio
async def test_declaring_an_absence_hands_the_chores_in_range_to_the_family(
    db_session: AsyncSession,
) -> None:
    household, members = await _drawn_household(db_session)
    papa = members[1]
    his = [
        a.id for a in await _assignments(db_session, household.id)
        if a.member_id == papa.id and _in_range(a)
    ]
    assert his, "the draw should have given Papá something that week"

    await create_absence(db_session, papa, AWAY_FROM, AWAY_TO, "Viaje")

    handed = [a for a in await _assignments(db_session, household.id) if a.id in his]
    assert all(a.member_id != papa.id for a in handed)
    assert all(a.status == "pending" for a in handed)


@pytest.mark.asyncio
async def test_chores_outside_the_absence_stay_with_the_member(
    db_session: AsyncSession,
) -> None:
    household, members = await _drawn_household(db_session)
    papa = members[1]
    outside = [
        a.id for a in await _assignments(db_session, household.id)
        if a.member_id == papa.id and not _in_range(a)
    ]

    await create_absence(db_session, papa, AWAY_FROM, AWAY_TO, None)

    kept = [a for a in await _assignments(db_session, household.id) if a.id in outside]
    assert outside and all(a.member_id == papa.id for a in kept)


@pytest.mark.asyncio
async def test_a_chore_already_done_keeps_its_credit(db_session: AsyncSession) -> None:
    household, members = await _drawn_household(db_session)
    papa = members[1]
    done = next(
        a for a in await _assignments(db_session, household.id)
        if a.member_id == papa.id and _in_range(a)
    )
    done.status = "done"
    done.completed_at = datetime.now(UTC)
    done.completed_by_member_id = papa.id
    await db_session.flush()

    await create_absence(db_session, papa, AWAY_FROM, AWAY_TO, None)

    await db_session.refresh(done)
    assert (done.member_id, done.status) == (papa.id, "done")


@pytest.mark.asyncio
async def test_the_handed_over_chores_go_to_the_lowest_balance(
    db_session: AsyncSession,
) -> None:
    """Not a rotation and not a coin toss: the same rule as the draw."""
    household, members = await _drawn_household(db_session)
    daniel, papa, mama, hermano = members
    for busy in (daniel, hermano):
        await create_adjustment(db_session, daniel, busy.id, 1000, "Ya hizo bastante")
    his = [
        a.id for a in await _assignments(db_session, household.id)
        if a.member_id == papa.id and _in_range(a)
    ]

    await create_absence(db_session, papa, AWAY_FROM, AWAY_TO, None)

    handed = [a for a in await _assignments(db_session, household.id) if a.id in his]
    assert {a.member_id for a in handed} == {mama.id}


@pytest.mark.asyncio
async def test_an_everyone_chore_is_skipped_not_doubled(db_session: AsyncSession) -> None:
    """Everyone owes an `applies_to_all` chore on their own. The others already
    hold their row, so the absent member's row is dropped, not handed over."""
    household, members = await _household_of_four(db_session)
    papa = members[1]
    bed = await create_chore(db_session, members[0], "Tender la cama", None, "daily", 1,
                             applies_to_all=True)
    await generate_cycle(db_session, members[0], date(2026, 9, 1), date(2026, 9, 14), seed=5)

    await create_absence(db_session, papa, AWAY_FROM, AWAY_TO, None)

    beds = [a for a in await _assignments(db_session, household.id)
            if a.chore_id == bed.id and _in_range(a)]
    assert {a.status for a in beds if a.member_id == papa.id} == {"skipped"}
    per_day: dict = {}
    for a in beds:
        if a.status == "pending":
            per_day.setdefault((a.due_on, a.member_id), 0)
            per_day[(a.due_on, a.member_id)] += 1
    assert set(per_day.values()) == {1}


@pytest.mark.asyncio
async def test_a_chore_nobody_can_take_is_skipped(db_session: AsyncSession) -> None:
    """The whole family is away: recorded as skipped, as the draw does."""
    household, members = await _drawn_household(db_session)
    papa = members[1]
    for other in (members[0], members[2], members[3]):
        db_session.add(
            MemberAbsence(
                id=new_id(), household_id=household.id, member_id=other.id,
                starts_on=AWAY_FROM, ends_on=AWAY_TO,
            )
        )
    await db_session.flush()
    his = [
        a.id for a in await _assignments(db_session, household.id)
        if a.member_id == papa.id and _in_range(a)
    ]

    await create_absence(db_session, papa, AWAY_FROM, AWAY_TO, None)

    handed = [a for a in await _assignments(db_session, household.id) if a.id in his]
    assert {a.status for a in handed} == {"skipped"}
