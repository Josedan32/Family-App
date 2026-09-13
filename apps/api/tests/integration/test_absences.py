"""C-05 and C-06.

Compensation is emergent: an absent member earns nothing while away, so their
balance stays flat and the ordinary rule assigns them more on return. There is
deliberately no effort-debt table to check.
"""

import random
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import ChoreAssignment, MemberAbsence
from family_api.ids import new_id
from family_api.services.assignment import generate_cycle
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
        rng=random.Random(11),
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
        rng=random.Random(13),
    )
    await _complete_everything(db_session, household.id)

    await generate_cycle(
        db_session, members[0], date(2026, 9, 15), date(2026, 9, 28),
        rng=random.Random(17),
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
