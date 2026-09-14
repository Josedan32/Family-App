"""The chore catalogue (FR-M8-16) and the reproducible draw (FR-M8-17).

The seed is what makes the wheel honest: every viewer replays the identical
spin because the draw itself is reproducible, not because the animation is
faked client-side.
"""

from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import ChoreAssignment, ChoreCycle
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


async def _chore_id(client: AsyncClient, headers: dict[str, str], name: str) -> str:
    listed = await client.get("/api/v1/chores", headers=headers)
    return next(c["id"] for c in listed.json() if c["name"] == name)


# ── The catalogue ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_chore_carries_activities_requirements_and_expectation(
    client: AsyncClient,
) -> None:
    headers = await _admin(client)

    response = await client.post(
        "/api/v1/chores",
        json={
            "name": "Pasear al perro",
            "frequency": "daily",
            "effort_points": 2,
            "activities": ["Poner la correa", "Dar la vuelta a la manzana", "Agua"],
            "requirements": ["Correa", "Bolsas"],
            "expectation": "El perro vuelve cansado y con agua fresca.",
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["activities"] == [
        "Poner la correa", "Dar la vuelta a la manzana", "Agua",
    ]
    assert body["requirements"] == ["Correa", "Bolsas"]
    assert body["expectation"].startswith("El perro vuelve")


@pytest.mark.asyncio
async def test_the_order_of_activities_is_preserved(client: AsyncClient) -> None:
    """They are steps, not a set. Reordering them changes the instructions."""
    headers = await _admin(client)
    steps = ["Uno", "Dos", "Tres", "Cuatro", "Cinco"]

    created = await client.post(
        "/api/v1/chores",
        json={
            "name": "Ordenada", "frequency": "weekly", "effort_points": 3,
            "activities": steps,
        },
        headers=headers,
    )

    assert created.json()["activities"] == steps

    listed = await client.get("/api/v1/chores", headers=headers)
    stored = next(c for c in listed.json() if c["name"] == "Ordenada")
    assert stored["activities"] == steps


@pytest.mark.asyncio
async def test_seeded_chores_start_with_an_empty_catalogue(
    client: AsyncClient,
) -> None:
    """The seven defaults predate the catalogue; they must not break."""
    headers = await _admin(client)
    listed = await client.get("/api/v1/chores", headers=headers)

    trapear = next(c for c in listed.json() if c["name"] == "Trapear")
    assert trapear["activities"] == []
    assert trapear["requirements"] == []
    assert trapear["expectation"] is None


@pytest.mark.asyncio
async def test_blank_and_padded_items_are_dropped(client: AsyncClient) -> None:
    headers = await _admin(client)

    created = await client.post(
        "/api/v1/chores",
        json={
            "name": "Sucia", "frequency": "weekly", "effort_points": 3,
            "activities": ["  Barrer  ", "", "   ", "Trapear"],
        },
        headers=headers,
    )

    assert created.json()["activities"] == ["Barrer", "Trapear"]


@pytest.mark.asyncio
async def test_an_oversized_list_is_rejected(client: AsyncClient) -> None:
    """The cap stops someone pasting a manual into a phone checklist."""
    headers = await _admin(client)

    response = await client.post(
        "/api/v1/chores",
        json={
            "name": "Manual", "frequency": "weekly", "effort_points": 3,
            "activities": [f"Paso {n}" for n in range(21)],
        },
        headers=headers,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_an_overlong_item_is_rejected(client: AsyncClient) -> None:
    headers = await _admin(client)

    response = await client.post(
        "/api/v1/chores",
        json={
            "name": "Larga", "frequency": "weekly", "effort_points": 3,
            "activities": ["x" * 121],
        },
        headers=headers,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_clearing_the_activities_is_a_real_edit(client: AsyncClient) -> None:
    """An empty list means "remove the steps"; only omitting the field leaves
    them untouched."""
    headers = await _admin(client)
    created = await client.post(
        "/api/v1/chores",
        json={
            "name": "Temporal", "frequency": "weekly", "effort_points": 3,
            "activities": ["Uno", "Dos"],
        },
        headers=headers,
    )
    chore_id = created.json()["id"]

    cleared = await client.patch(
        f"/api/v1/chores/{chore_id}", json={"activities": []}, headers=headers
    )
    assert cleared.json()["activities"] == []

    untouched = await client.patch(
        f"/api/v1/chores/{chore_id}", json={"name": "Renombrada"}, headers=headers
    )
    assert untouched.json()["activities"] == []


@pytest.mark.asyncio
async def test_a_non_admin_cannot_edit_the_catalogue(client: AsyncClient) -> None:
    """FR-M8-03 covers the whole chore definition, not only its points."""
    admin = await _admin(client)
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=admin,
    )
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "papa@example.com",
            "password": "correct-horse-battery",
            "display_name": "Papá",
        },
    )
    papa = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=papa
    )
    chore_id = await _chore_id(client, admin, "Trapear")

    response = await client.patch(
        f"/api/v1/chores/{chore_id}",
        json={"activities": ["Mi propio paso"]},
        headers=papa,
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_the_catalogue_travels_on_the_assignment(client: AsyncClient) -> None:
    """The checklist has to be there while you do the chore, without a second
    round trip to /chores."""
    headers = await _admin(client)
    chore_id = await _chore_id(client, headers, "Limpiar baño")
    await client.patch(
        f"/api/v1/chores/{chore_id}",
        json={
            "activities": ["Sanitario", "Lavamanos", "Espejo"],
            "requirements": ["Guantes", "Cloro"],
            "expectation": "Sin manchas y con el espejo seco.",
        },
        headers=headers,
    )
    # The endpoint resolves "current" against today, so the cycle has to
    # straddle it.
    today = date.today()
    await client.post(
        "/api/v1/chore-cycles",
        json={
            "starts_on": (today - timedelta(days=3)).isoformat(),
            "ends_on": (today + timedelta(days=10)).isoformat(),
        },
        headers=headers,
    )

    current = await client.get("/api/v1/chore-cycles/current", headers=headers)
    assert current.status_code == 200

    bano = next(
        a for a in current.json()["assignments"] if a["chore_name"] == "Limpiar baño"
    )
    assert bano["chore_activities"] == ["Sanitario", "Lavamanos", "Espejo"]
    assert bano["chore_requirements"] == ["Guantes", "Cloro"]
    assert bano["chore_expectation"] == "Sin manchas y con el espejo seco."


# ── The reproducible draw ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_the_seed_is_persisted_on_the_cycle(db_session: AsyncSession) -> None:
    household, members = await _household_of_four(db_session)

    cycle = await generate_cycle(
        db_session, members[0], date(2026, 10, 1), date(2026, 10, 14), seed=4242
    )

    assert cycle.seed == 4242


@pytest.mark.asyncio
async def test_a_cycle_drawn_without_a_seed_still_records_one(
    db_session: AsyncSession,
) -> None:
    """Otherwise the wheel has nothing to replay."""
    household, members = await _household_of_four(db_session)

    cycle = await generate_cycle(
        db_session, members[0], date(2026, 10, 1), date(2026, 10, 14)
    )

    assert cycle.seed > 0


@pytest.mark.asyncio
async def test_the_same_seed_reproduces_the_same_draw(
    db_session: AsyncSession,
) -> None:
    """This is what lets the wheel replay honestly: the outcome is a function
    of the seed, so showing it again is showing the same thing, not a re-roll."""
    household, members = await _household_of_four(db_session)

    async def draw(seed: int) -> list[tuple[str, str]]:
        cycle = await generate_cycle(
            db_session, members[0], date(2026, 10, 1), date(2026, 10, 14), seed=seed
        )
        rows = (
            await db_session.scalars(
                select(ChoreAssignment)
                .where(ChoreAssignment.cycle_id == cycle.id)
                .order_by(ChoreAssignment.due_on, ChoreAssignment.chore_id)
            )
        ).all()
        result = [(str(a.chore_id), str(a.member_id)) for a in rows]

        # Clear it so the next draw is not blocked by the unique constraint on
        # (household_id, starts_on).
        await db_session.execute(
            delete(ChoreAssignment).where(ChoreAssignment.cycle_id == cycle.id)
        )
        await db_session.execute(delete(ChoreCycle).where(ChoreCycle.id == cycle.id))
        await db_session.flush()
        return result

    first = await draw(99)
    second = await draw(99)
    different = await draw(100)

    assert first == second
    assert first, "the draw produced no assignments, so the test proves nothing"
    assert first != different, "two seeds produced an identical draw; suspicious"
