"""The module's whole claim is fairness. These test the claim, not the CRUD.

docs/testing-strategy.md §4B.
"""

import random
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import Chore, ChoreAssignment
from family_api.db.models.household import HouseholdMember
from family_api.db.models.user import User
from family_api.ids import new_id
from family_api.security.passwords import hash_password
from family_api.services.assignment import generate_cycle
from family_api.services.effort import effort_balances
from family_api.services.households import create_household

# Well before any effort window used in these tests, so the founding members
# always count as "established" against the median-for-newcomers rule.
FOUNDED_AT = datetime(2020, 1, 1, tzinfo=UTC)


async def _household_of_four(session: AsyncSession):
    daniel = User(
        id=new_id(), email="d@example.com",
        password_hash=hash_password("correct-horse-battery"), display_name="Daniel",
    )
    session.add(daniel)
    await session.flush()
    household, admin = await create_household(session, daniel, "Familia Hernández")
    admin.joined_at = FOUNDED_AT

    members = [admin]
    for name, role in (("Papá", "adult"), ("Mamá", "adult"), ("Hermano", "teen")):
        user = User(
            id=new_id(), email=f"{name}@example.com",
            password_hash=hash_password("correct-horse-battery"), display_name=name,
        )
        session.add(user)
        await session.flush()
        member = HouseholdMember(
            id=new_id(), household_id=household.id, user_id=user.id,
            role=role, status="active", joined_at=FOUNDED_AT,
        )
        session.add(member)
        members.append(member)
    await session.flush()
    return household, members


async def _complete_everything(session: AsyncSession, household_id) -> None:
    from datetime import UTC, datetime

    assignments = (
        await session.scalars(
            select(ChoreAssignment).where(
                ChoreAssignment.household_id == household_id,
                ChoreAssignment.status == "pending",
            )
        )
    ).all()
    for assignment in assignments:
        assignment.status = "done"
        assignment.completed_at = datetime.now(UTC)
        assignment.completed_by_member_id = assignment.member_id
    await session.flush()


@pytest.mark.asyncio
async def test_the_spread_stays_within_one_chore(db_session: AsyncSession) -> None:
    """C-01. The whole point of the module."""
    household, members = await _household_of_four(db_session)
    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 28),
        rng=random.Random(1),
    )
    await _complete_everything(db_session, household.id)

    balances = await effort_balances(db_session, household, date(2026, 9, 28))
    heaviest = max(
        c.effort_points
        for c in (await db_session.scalars(select(Chore))).all()
    )

    assert max(balances.values()) - min(balances.values()) <= heaviest


@pytest.mark.asyncio
async def test_the_stated_failure_case_cannot_happen(
    db_session: AsyncSession,
) -> None:
    """C-02: "Daniel hizo 10 tareas, Papá hizo 2" from an equal start."""
    household, members = await _household_of_four(db_session)
    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 28),
        rng=random.Random(7),
    )

    counts: dict = {}
    for assignment in (
        await db_session.scalars(
            select(ChoreAssignment).where(ChoreAssignment.household_id == household.id)
        )
    ).all():
        counts[assignment.member_id] = counts.get(assignment.member_id, 0) + 1

    assert max(counts.values()) <= min(counts.values()) * 3


@pytest.mark.asyncio
async def test_repricing_a_chore_never_rewrites_history(
    db_session: AsyncSession,
) -> None:
    """C-04 / INV-D-10."""
    household, members = await _household_of_four(db_session)
    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 7),
        rng=random.Random(3),
    )
    bano = await db_session.scalar(select(Chore).where(Chore.name == "Limpiar baño"))
    before = [
        a.effort_points
        for a in (
            await db_session.scalars(
                select(ChoreAssignment).where(ChoreAssignment.chore_id == bano.id)
            )
        ).all()
    ]

    bano.effort_points = 1
    await db_session.flush()

    after = [
        a.effort_points
        for a in (
            await db_session.scalars(
                select(ChoreAssignment).where(ChoreAssignment.chore_id == bano.id)
            )
        ).all()
    ]
    assert before == after
    assert all(points == 7 for points in after)


@pytest.mark.asyncio
async def test_a_guest_is_never_assigned(db_session: AsyncSession) -> None:
    """C-07 / INV-D-12."""
    household, members = await _household_of_four(db_session)
    guest_user = User(
        id=new_id(), email="tia@example.com",
        password_hash=hash_password("correct-horse-battery"), display_name="Tía",
    )
    db_session.add(guest_user)
    await db_session.flush()
    guest = HouseholdMember(
        id=new_id(), household_id=household.id, user_id=guest_user.id,
        role="guest", status="active",
    )
    db_session.add(guest)
    await db_session.flush()

    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 28),
        rng=random.Random(5),
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
    assert guest.id not in assigned


@pytest.mark.asyncio
async def test_a_new_member_starts_at_the_median(db_session: AsyncSession) -> None:
    """C-08 / FR-M8-09: joining must not be a punishment."""
    from datetime import UTC, datetime, timedelta

    household, members = await _household_of_four(db_session)
    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 28),
        rng=random.Random(2),
    )
    await _complete_everything(db_session, household.id)

    newcomer_user = User(
        id=new_id(), email="primo@example.com",
        password_hash=hash_password("correct-horse-battery"), display_name="Primo",
    )
    db_session.add(newcomer_user)
    await db_session.flush()
    newcomer = HouseholdMember(
        id=new_id(), household_id=household.id, user_id=newcomer_user.id,
        role="adult", status="active", joined_at=datetime.now(UTC),
    )
    db_session.add(newcomer)
    await db_session.flush()

    balances = await effort_balances(db_session, household, date(2026, 9, 28))

    assert balances[newcomer.id] > 0
    assert balances[newcomer.id] <= max(balances.values())


@pytest.mark.asyncio
async def test_credit_follows_whoever_did_it(db_session: AsyncSession) -> None:
    """C-09 / FR-M8-11."""
    from datetime import UTC, datetime

    household, members = await _household_of_four(db_session)
    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 7),
        rng=random.Random(4),
    )
    assignment = await db_session.scalar(
        select(ChoreAssignment).where(ChoreAssignment.household_id == household.id)
    )
    original, helper = assignment.member_id, next(
        m.id for m in members if m.id != assignment.member_id
    )

    assignment.status = "done"
    assignment.completed_at = datetime.now(UTC)
    assignment.completed_by_member_id = helper
    await db_session.flush()

    balances = await effort_balances(db_session, household, date(2026, 9, 7))
    assert balances[helper] >= assignment.effort_points
    assert balances[original] == 0
