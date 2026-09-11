import pytest
from httpx import AsyncClient


async def _member(client: AsyncClient) -> dict[str, str]:
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
async def test_member_can_create_a_goal(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Moto", "target_amount_minor": 8000000},
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Moto"
    assert body["balance_minor"] == 0
    assert body["progress"] == 0.0


@pytest.mark.asyncio
async def test_balance_is_deposits_minus_withdrawals(client: AsyncClient) -> None:
    """FR-M2-08 / L-09: derived, never a stored column."""
    headers = await _member(client)
    created = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Moto", "target_amount_minor": 8000000},
        headers=headers,
    )
    goal_id = created.json()["id"]

    for kind, amount in (("deposit", 500000), ("deposit", 300000), ("withdrawal", 100000)):
        await client.post(
            f"/api/v1/me/savings-goals/{goal_id}/entries",
            json={"kind": kind, "amount_minor": amount, "occurred_on": "2026-09-02"},
            headers=headers,
        )

    listed = await client.get("/api/v1/me/savings-goals", headers=headers)
    goal = listed.json()[0]

    assert goal["balance_minor"] == 700000
    assert goal["progress"] == pytest.approx(0.0875)


@pytest.mark.asyncio
async def test_progress_is_reported_truthfully_above_target(client: AsyncClient) -> None:
    """FR-M2-09: the API reports the truth; the client caps the display."""
    headers = await _member(client)
    created = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Viaje", "target_amount_minor": 100000},
        headers=headers,
    )
    goal_id = created.json()["id"]
    await client.post(
        f"/api/v1/me/savings-goals/{goal_id}/entries",
        json={"kind": "deposit", "amount_minor": 150000, "occurred_on": "2026-09-02"},
        headers=headers,
    )

    listed = await client.get("/api/v1/me/savings-goals", headers=headers)
    assert listed.json()[0]["progress"] == pytest.approx(1.5)


@pytest.mark.asyncio
async def test_no_stored_balance_column_exists() -> None:
    """L-09: a stored balance is a second source of truth waiting to disagree."""
    from family_api.db.models.savings import SavingsGoal

    assert "balance_minor" not in SavingsGoal.__table__.columns


@pytest.mark.asyncio
async def test_entries_must_be_positive(client: AsyncClient) -> None:
    headers = await _member(client)
    created = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Moto", "target_amount_minor": 8000000},
        headers=headers,
    )
    goal_id = created.json()["id"]

    response = await client.post(
        f"/api/v1/me/savings-goals/{goal_id}/entries",
        json={"kind": "deposit", "amount_minor": -1, "occurred_on": "2026-09-02"},
        headers=headers,
    )

    assert response.status_code == 422
