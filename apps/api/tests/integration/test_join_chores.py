"""A member who joins mid-cycle is dealt into what is left of it.

Without this, whoever joins after the draw has no chores until the next cycle
while the rest of the family carries their share.
"""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import Chore, ChoreAssignment
from family_api.db.models.household import HouseholdMember
from family_api.db.models.user import User
from family_api.ids import new_id
from family_api.security.passwords import hash_password
from family_api.services.assignment import generate_cycle
from family_api.services.chores import create_chore
from family_api.services.invites import issue_invite, redeem_invite
from tests.integration.test_fairness import _household_of_four


async def _cycle_around_today(session: AsyncSession, seed: int = 3):
    household, members = await _household_of_four(session)
    today = datetime.now(ZoneInfo(household.timezone)).date()
    await generate_cycle(
        session, members[0], today - timedelta(days=5), today + timedelta(days=8), seed=seed
    )
    return household, members, today


async def _join(session: AsyncSession, admin: HouseholdMember, role: str = "adult"):
    user = User(
        id=new_id(), email="abuela@example.com",
        password_hash=hash_password("correct-horse-battery"), display_name="Abuela",
    )
    session.add(user)
    await session.flush()
    invite = await issue_invite(session, admin, role)
    return await redeem_invite(session, user, invite.code)


async def _assignments(session: AsyncSession, household_id) -> list[ChoreAssignment]:
    return list(
        (
            await session.scalars(
                select(ChoreAssignment).where(ChoreAssignment.household_id == household_id)
            )
        ).all()
    )


@pytest.mark.asyncio
async def test_a_new_member_is_dealt_chores_from_what_is_left(
    db_session: AsyncSession,
) -> None:
    household, members, today = await _cycle_around_today(db_session)

    abuela = await _join(db_session, members[0])

    hers = [a for a in await _assignments(db_session, household.id) if a.member_id == abuela.id]
    assert hers
    assert all(a.due_on >= today and a.status == "pending" for a in hers)


@pytest.mark.asyncio
async def test_past_and_finished_chores_do_not_change_hands(
    db_session: AsyncSession,
) -> None:
    household, members, today = await _cycle_around_today(db_session)
    finished = next(
        a for a in await _assignments(db_session, household.id) if a.due_on > today
    )
    finished.status = "done"
    finished.completed_at = datetime.now(UTC)
    finished.completed_by_member_id = finished.member_id
    await db_session.flush()
    before = {
        a.id: a.member_id
        for a in await _assignments(db_session, household.id)
        if a.due_on < today or a.status == "done"
    }

    await _join(db_session, members[0])

    after = {a.id: a.member_id for a in await _assignments(db_session, household.id)}
    assert {i: after[i] for i in before} == before


@pytest.mark.asyncio
async def test_what_is_left_is_shared_fairly_with_the_newcomer(
    db_session: AsyncSession,
) -> None:
    """The same claim as the draw: nobody ends more than one chore apart."""
    household, members, today = await _cycle_around_today(db_session)

    abuela = await _join(db_session, members[0])

    load = {m.id: 0 for m in [*members, abuela]}
    for a in await _assignments(db_session, household.id):
        if a.due_on >= today and a.status == "pending":
            load[a.member_id] += a.effort_points
    heaviest = max(c.effort_points for c in (await db_session.scalars(select(Chore))).all())
    assert max(load.values()) - min(load.values()) <= heaviest


@pytest.mark.asyncio
async def test_a_new_member_owes_the_everyone_chores_from_today(
    db_session: AsyncSession,
) -> None:
    household, members = await _household_of_four(db_session)
    today = datetime.now(ZoneInfo(household.timezone)).date()
    bed = await create_chore(db_session, members[0], "Tender la cama", None, "daily", 1,
                             applies_to_all=True)
    await generate_cycle(
        db_session, members[0], today - timedelta(days=5), today + timedelta(days=8), seed=3
    )

    abuela = await _join(db_session, members[0])

    days = sorted(
        a.due_on for a in await _assignments(db_session, household.id)
        if a.chore_id == bed.id and a.member_id == abuela.id
    )
    assert days == [today + timedelta(days=n) for n in range(9)]


@pytest.mark.asyncio
async def test_a_guest_is_dealt_nothing(db_session: AsyncSession) -> None:
    """Guests are never assigned chores (FR-M8-06)."""
    household, members, _ = await _cycle_around_today(db_session)

    guest = await _join(db_session, members[0], role="guest")

    assert not [a for a in await _assignments(db_session, household.id)
                if a.member_id == guest.id]


@pytest.mark.asyncio
async def test_joining_with_no_cycle_drawn_is_fine(db_session: AsyncSession) -> None:
    household, members = await _household_of_four(db_session)

    abuela = await _join(db_session, members[0])

    assert abuela.status == "active"
    assert await _assignments(db_session, household.id) == []
