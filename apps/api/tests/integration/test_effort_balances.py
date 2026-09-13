import pytest
from httpx import AsyncClient


async def _household(client: AsyncClient) -> tuple[dict, dict]:
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
async def test_everyone_starts_at_zero(client: AsyncClient) -> None:
    admin, _ = await _household(client)
    response = await client.get("/api/v1/effort-balances", headers=admin)

    assert response.status_code == 200
    body = response.json()
    assert body["window_days"] == 60
    assert all(row["effort_points"] == 0 for row in body["members"])


@pytest.mark.asyncio
async def test_completing_a_chore_earns_its_frozen_weight(
    client: AsyncClient,
) -> None:
    admin, _ = await _household(client)
    await client.post(
        "/api/v1/chore-cycles",
        json={"starts_on": "2026-09-01", "ends_on": "2026-09-07"},
        headers=admin,
    )
    cycle = await client.get("/api/v1/chore-cycles/current", headers=admin)
    assignment = cycle.json()["assignments"][0]

    await client.post(
        f"/api/v1/chore-assignments/{assignment['id']}/complete", headers=admin
    )

    balances = await client.get("/api/v1/effort-balances", headers=admin)
    row = next(
        r for r in balances.json()["members"] if r["member_id"] == assignment["member_id"]
    )
    assert row["effort_points"] == assignment["effort_points"]
    assert row["completed_count"] == 1


@pytest.mark.asyncio
async def test_a_manual_adjustment_moves_the_balance(client: AsyncClient) -> None:
    """FR-M8-14."""
    admin, _ = await _household(client)
    members = await client.get("/api/v1/households/current", headers=admin)
    papa_id = next(
        m["id"] for m in members.json()["members"] if m["display_name"] == "Papá"
    )

    await client.post(
        "/api/v1/effort-adjustments",
        json={"member_id": papa_id, "points": 12, "reason": "Pintó la sala"},
        headers=admin,
    )

    balances = await client.get("/api/v1/effort-balances", headers=admin)
    row = next(r for r in balances.json()["members"] if r["member_id"] == papa_id)
    assert row["effort_points"] == 12


@pytest.mark.asyncio
async def test_an_adjustment_without_a_reason_is_rejected(
    client: AsyncClient,
) -> None:
    """C-12."""
    admin, _ = await _household(client)
    members = await client.get("/api/v1/households/current", headers=admin)
    papa_id = next(
        m["id"] for m in members.json()["members"] if m["display_name"] == "Papá"
    )

    response = await client.post(
        "/api/v1/effort-adjustments",
        json={"member_id": papa_id, "points": 12, "reason": ""},
        headers=admin,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_a_non_admin_cannot_adjust_effort(client: AsyncClient) -> None:
    _, papa = await _household(client)
    response = await client.post(
        "/api/v1/effort-adjustments",
        json={"member_id": "00000000-0000-0000-0000-000000000000",
              "points": 50, "reason": "porque sí"},
        headers=papa,
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_a_guest_has_no_balance_row(client: AsyncClient) -> None:
    """C-07: guests are outside the fairness system entirely."""
    admin, _ = await _household(client)
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "guest"},
        headers=admin,
    )
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "tia@example.com",
            "password": "correct-horse-battery",
            "display_name": "Tía",
        },
    )
    guest = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=guest
    )

    balances = await client.get("/api/v1/effort-balances", headers=admin)
    names = {row["display_name"] for row in balances.json()["members"]}
    assert "Tía" not in names
