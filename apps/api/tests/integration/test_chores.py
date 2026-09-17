from datetime import date, timedelta

import pytest
from httpx import AsyncClient


async def _admin_and_adult(client: AsyncClient) -> tuple[dict, dict]:
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    admin = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=admin)
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=admin,
    )
    registered_papa = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "papa@example.com",
            "password": "correct-horse-battery",
            "display_name": "Papá",
        },
    )
    papa = {"Authorization": f"Bearer {registered_papa.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=papa
    )
    return admin, papa


@pytest.mark.asyncio
async def test_a_new_household_gets_the_seeded_chores(client: AsyncClient) -> None:
    """FR-M8-02: effort is the whole mechanism, so defaults are deliberate."""
    admin, _ = await _admin_and_adult(client)
    response = await client.get("/api/v1/chores", headers=admin)

    assert response.status_code == 200
    by_name = {c["name"]: c["effort_points"] for c in response.json()}
    assert by_name["Sacar la basura"] == 1
    assert by_name["Tender camas"] == 2
    assert by_name["Lavar platos"] == 3
    assert by_name["Lavar ropa"] == 4
    assert by_name["Cocinar"] == 5
    assert by_name["Trapear"] == 5
    assert by_name["Limpiar baño"] == 7


@pytest.mark.asyncio
async def test_admin_can_create_a_chore(client: AsyncClient) -> None:
    admin, _ = await _admin_and_adult(client)
    response = await client.post(
        "/api/v1/chores",
        json={"name": "Pasear al perro", "frequency": "daily", "effort_points": 2},
        headers=admin,
    )

    assert response.status_code == 201
    assert response.json()["effort_points"] == 2


@pytest.mark.asyncio
async def test_a_non_admin_cannot_create_a_chore(client: AsyncClient) -> None:
    """C-11 / FR-M8-03: effort weight is the currency of fairness."""
    _, papa = await _admin_and_adult(client)
    response = await client.post(
        "/api/v1/chores",
        json={"name": "Pasear al perro", "frequency": "daily", "effort_points": 2},
        headers=papa,
    )

    assert response.status_code == 403
    assert response.json()["type"] == "forbidden_role"


@pytest.mark.asyncio
async def test_a_non_admin_cannot_reprice_a_chore(client: AsyncClient) -> None:
    admin, papa = await _admin_and_adult(client)
    listed = await client.get("/api/v1/chores", headers=admin)
    chore_id = next(c["id"] for c in listed.json() if c["name"] == "Limpiar baño")

    response = await client.patch(
        f"/api/v1/chores/{chore_id}", json={"effort_points": 1}, headers=papa
    )

    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("points", [0, 11, -3])
async def test_effort_points_stay_within_one_to_ten(
    client: AsyncClient, points: int
) -> None:
    admin, _ = await _admin_and_adult(client)
    response = await client.post(
        "/api/v1/chores",
        json={"name": "Algo", "frequency": "weekly", "effort_points": points},
        headers=admin,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_duplicate_chore_names_are_rejected(client: AsyncClient) -> None:
    admin, _ = await _admin_and_adult(client)
    response = await client.post(
        "/api/v1/chores",
        json={"name": "Trapear", "frequency": "weekly", "effort_points": 5},
        headers=admin,
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_deleting_a_chore_archives_it(client: AsyncClient) -> None:
    admin, _ = await _admin_and_adult(client)
    listed = await client.get("/api/v1/chores", headers=admin)
    chore_id = next(c["id"] for c in listed.json() if c["name"] == "Cocinar")

    assert (
        await client.delete(f"/api/v1/chores/{chore_id}", headers=admin)
    ).status_code == 204

    after = await client.get("/api/v1/chores", headers=admin)
    assert "Cocinar" not in {c["name"] for c in after.json()}


@pytest.mark.asyncio
async def test_any_member_can_read_chores(client: AsyncClient) -> None:
    """FR-M8-15: no visibility rules on chores at all."""
    _, papa = await _admin_and_adult(client)
    assert (await client.get("/api/v1/chores", headers=papa)).status_code == 200


@pytest.mark.asyncio
async def test_assignments_can_be_filtered_to_one_member(client: AsyncClient) -> None:
    admin, papa = await _admin_and_adult(client)
    today = date.today()
    await client.post(
        "/api/v1/chore-cycles",
        json={
            "starts_on": (today - timedelta(days=3)).isoformat(),
            "ends_on": (today + timedelta(days=10)).isoformat(),
        },
        headers=admin,
    )

    members = await client.get("/api/v1/households/current", headers=admin)
    papa_id = next(
        m["id"] for m in members.json()["members"] if m["display_name"] == "Papá"
    )

    all_assignments = await client.get("/api/v1/chore-assignments", headers=admin)
    filtered = await client.get(
        f"/api/v1/chore-assignments?member_id={papa_id}", headers=admin
    )

    assert filtered.status_code == 200
    assert all(a["member_id"] == papa_id for a in filtered.json())
    assert len(filtered.json()) <= len(all_assignments.json())


@pytest.mark.asyncio
async def test_filtering_by_a_member_outside_the_household_returns_nothing(
    client: AsyncClient,
) -> None:
    admin, _ = await _admin_and_adult(client)
    today = date.today()
    await client.post(
        "/api/v1/chore-cycles",
        json={
            "starts_on": (today - timedelta(days=3)).isoformat(),
            "ends_on": (today + timedelta(days=10)).isoformat(),
        },
        headers=admin,
    )

    response = await client.get(
        "/api/v1/chore-assignments?member_id=00000000-0000-0000-0000-000000000000",
        headers=admin,
    )

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_assignments_can_be_filtered_by_status(client: AsyncClient) -> None:
    admin, _ = await _admin_and_adult(client)
    today = date.today()
    await client.post(
        "/api/v1/chore-cycles",
        json={
            "starts_on": (today - timedelta(days=3)).isoformat(),
            "ends_on": (today + timedelta(days=10)).isoformat(),
        },
        headers=admin,
    )

    all_assignments = (
        await client.get("/api/v1/chore-assignments", headers=admin)
    ).json()
    to_complete = all_assignments[0]["id"]
    await client.post(f"/api/v1/chore-assignments/{to_complete}/complete", headers=admin)

    done = await client.get("/api/v1/chore-assignments?status=done", headers=admin)
    pending = await client.get("/api/v1/chore-assignments?status=pending", headers=admin)

    assert done.status_code == 200
    assert [a["id"] for a in done.json()] == [to_complete]
    assert all(a["status"] == "pending" for a in pending.json())
    assert to_complete not in [a["id"] for a in pending.json()]
    assert len(done.json()) + len(pending.json()) == len(all_assignments)


@pytest.mark.asyncio
async def test_assignments_can_be_filtered_by_due_date_range(client: AsyncClient) -> None:
    admin, _ = await _admin_and_adult(client)
    today = date.today()
    await client.post(
        "/api/v1/chore-cycles",
        json={
            "starts_on": (today - timedelta(days=3)).isoformat(),
            "ends_on": (today + timedelta(days=10)).isoformat(),
        },
        headers=admin,
    )

    all_assignments = (
        await client.get("/api/v1/chore-assignments", headers=admin)
    ).json()
    assert all_assignments, "cycle should generate at least one assignment"

    from_date = today.isoformat()
    to_date = (today + timedelta(days=3)).isoformat()
    ranged = await client.get(
        f"/api/v1/chore-assignments?from={from_date}&to={to_date}", headers=admin
    )

    assert ranged.status_code == 200
    assert all(from_date <= a["due_on"] <= to_date for a in ranged.json())
    assert len(ranged.json()) <= len(all_assignments)


@pytest.mark.asyncio
async def test_assignments_can_be_filtered_by_status_and_member_combined(
    client: AsyncClient,
) -> None:
    admin, _ = await _admin_and_adult(client)
    today = date.today()
    await client.post(
        "/api/v1/chore-cycles",
        json={
            "starts_on": (today - timedelta(days=3)).isoformat(),
            "ends_on": (today + timedelta(days=10)).isoformat(),
        },
        headers=admin,
    )

    members = await client.get("/api/v1/households/current", headers=admin)
    papa_id = next(
        m["id"] for m in members.json()["members"] if m["display_name"] == "Papá"
    )

    response = await client.get(
        f"/api/v1/chore-assignments?member_id={papa_id}&status=pending", headers=admin
    )

    assert response.status_code == 200
    assert all(
        a["member_id"] == papa_id and a["status"] == "pending" for a in response.json()
    )
