"""A chore that applies to every member (FR-M8-13 style feature request).

"Tender la cama" or "lavar su propio plato" is not a chore to divide by
effort — everyone owes it every day. The draw must give one assignment per
eligible member for these, entirely outside the balanced-by-effort mechanism.
"""

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import Chore, ChoreAssignment
from family_api.db.models.household import HouseholdMember
from family_api.db.models.user import User
from family_api.ids import new_id
from family_api.security.passwords import hash_password
from family_api.services.assignment import generate_cycle
from tests.integration.test_fairness import _household_of_four


async def _admin(client: AsyncClient) -> dict[str, str]:
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=headers)
    return headers


@pytest.mark.asyncio
async def test_a_chore_can_be_marked_applies_to_all(client: AsyncClient) -> None:
    headers = await _admin(client)

    response = await client.post(
        "/api/v1/chores",
        json={
            "name": "Tender la cama", "frequency": "daily",
            "effort_points": 1, "applies_to_all": True,
        },
        headers=headers,
    )

    assert response.status_code == 201
    assert response.json()["applies_to_all"] is True


@pytest.mark.asyncio
async def test_applies_to_all_defaults_to_false(client: AsyncClient) -> None:
    headers = await _admin(client)

    response = await client.post(
        "/api/v1/chores",
        json={"name": "Regar las plantas", "frequency": "daily", "effort_points": 1},
        headers=headers,
    )

    assert response.status_code == 201
    assert response.json()["applies_to_all"] is False


@pytest.mark.asyncio
async def test_applies_to_all_assigns_every_eligible_member(
    db_session: AsyncSession,
) -> None:
    household, members = await _household_of_four(db_session)
    chore = Chore(
        id=new_id(), household_id=household.id, name="Tender la cama",
        frequency="daily", effort_points=1, applies_to_all=True,
    )
    db_session.add(chore)
    await db_session.flush()

    await generate_cycle(db_session, members[0], date(2026, 9, 1), date(2026, 9, 1))

    assigned = {
        a.member_id
        for a in (
            await db_session.scalars(
                select(ChoreAssignment).where(ChoreAssignment.chore_id == chore.id)
            )
        ).all()
    }
    assert assigned == {m.id for m in members}


@pytest.mark.asyncio
async def test_applies_to_all_excludes_guests(db_session: AsyncSession) -> None:
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
    chore = Chore(
        id=new_id(), household_id=household.id, name="Tender la cama",
        frequency="daily", effort_points=1, applies_to_all=True,
    )
    db_session.add(chore)
    await db_session.flush()

    await generate_cycle(db_session, members[0], date(2026, 9, 1), date(2026, 9, 1))

    assigned = {
        a.member_id
        for a in (
            await db_session.scalars(
                select(ChoreAssignment).where(ChoreAssignment.chore_id == chore.id)
            )
        ).all()
    }
    assert guest.id not in assigned
    assert assigned == {m.id for m in members}


@pytest.mark.asyncio
async def test_applies_to_all_does_not_go_through_the_balanced_draw(
    db_session: AsyncSession,
) -> None:
    """A single member is never chosen for it — everyone gets their own row,
    which is only possible if it skipped `choose_assignee` entirely."""
    household, members = await _household_of_four(db_session)
    chore = Chore(
        id=new_id(), household_id=household.id, name="Lavar su plato",
        frequency="daily", effort_points=1, applies_to_all=True,
    )
    db_session.add(chore)
    await db_session.flush()

    await generate_cycle(db_session, members[0], date(2026, 9, 1), date(2026, 9, 3))

    rows = (
        await db_session.scalars(
            select(ChoreAssignment).where(ChoreAssignment.chore_id == chore.id)
        )
    ).all()
    # 3 days * 4 members = 12 rows, not 3 (one balanced pick per day).
    assert len(rows) == 3 * len(members)
