import pytest
from httpx import AsyncClient


async def _setup(client: AsyncClient) -> tuple[dict, str, str]:
    """Returns (headers, period_id, expense_category_id)."""
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
    period = await client.post(
        "/api/v1/contribution-periods",
        json={"period_month": "2026-09-01", "goal_amount_minor": 2_000_000},
        headers=headers,
    )
    categories = await client.get("/api/v1/categories?kind=expense", headers=headers)
    category_id = next(c["id"] for c in categories.json() if c["name"] == "Otros")
    return headers, period.json()["id"], category_id


@pytest.mark.asyncio
async def test_an_empty_pot_is_zero(client: AsyncClient) -> None:
    headers, _, _ = await _setup(client)
    response = await client.get("/api/v1/household-expenses/pot", headers=headers)

    assert response.status_code == 200
    assert response.json() == {
        "collected_minor": 0, "spent_minor": 0, "balance_minor": 0, "currency": "COP",
    }


@pytest.mark.asyncio
async def test_a_contribution_fills_the_pot(client: AsyncClient) -> None:
    headers, period_id, _ = await _setup(client)
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=headers,
    )

    pot = await client.get("/api/v1/household-expenses/pot", headers=headers)

    assert pot.json()["collected_minor"] == 1_000_000
    assert pot.json()["balance_minor"] == 1_000_000


@pytest.mark.asyncio
async def test_a_pot_funded_expense_empties_it(client: AsyncClient) -> None:
    headers, period_id, category_id = await _setup(client)
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=headers,
    )
    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 400_000,
            "occurred_on": "2026-09-06", "funding": "pot",
        },
        headers=headers,
    )

    pot = await client.get("/api/v1/household-expenses/pot", headers=headers)

    assert pot.json()["spent_minor"] == 400_000
    assert pot.json()["balance_minor"] == 600_000


@pytest.mark.asyncio
async def test_no_stored_balance_column_exists() -> None:
    from family_api.db.models.household import Household

    assert "pot_balance_minor" not in Household.__table__.columns
