"""Taking money out of a savings goal counts as income in that month.

The money comes back to your pocket and is spendable again, so the month
that receives it must show it — as a read-only income row labelled "Retiro de
ahorro", mirrored from the savings entry the same way a contribution mirrors
its expense.
"""

import pytest
from httpx import AsyncClient


async def _member(client: AsyncClient) -> dict[str, str]:
    registered = await client.post(
        "/api/v1/auth/register",
        json={"email": "daniel@example.com", "password": "correct-horse-battery",
              "display_name": "Daniel"},
    )
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=headers)
    return headers


async def _goal_with(client: AsyncClient, headers: dict[str, str], *entries: dict) -> str:
    goal = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Moto", "target_amount_minor": 15_000_000},
        headers=headers,
    )
    goal_id = str(goal.json()["id"])
    for entry in entries:
        await client.post(
            f"/api/v1/me/savings-goals/{goal_id}/entries", json=entry, headers=headers
        )
    return goal_id


DEPOSIT = {"kind": "deposit", "amount_minor": 500_000, "occurred_on": "2026-08-10"}
WITHDRAWAL = {
    "kind": "withdrawal", "amount_minor": 200_000, "occurred_on": "2026-09-12",
    "note": "Para el SOAT",
}


async def _income(client: AsyncClient, headers: dict[str, str], period: str) -> list[dict]:
    listed = await client.get(
        f"/api/v1/me/transactions?kind=income&period={period}", headers=headers
    )
    return list(listed.json()["items"])


@pytest.mark.asyncio
async def test_a_withdrawal_shows_up_as_income_that_month(client: AsyncClient) -> None:
    headers = await _member(client)
    await _goal_with(client, headers, DEPOSIT, WITHDRAWAL)

    income = await _income(client, headers, "2026-09")

    assert len(income) == 1
    row = income[0]
    assert row["amount_minor"] == 200_000
    assert row["occurred_on"] == "2026-09-12"
    assert row["source"] == "savings_withdrawal"
    assert [c["name"] for c in row["categories"]] == ["Retiro de ahorro"]


@pytest.mark.asyncio
async def test_a_deposit_is_not_income(client: AsyncClient) -> None:
    headers = await _member(client)
    await _goal_with(client, headers, DEPOSIT)

    assert await _income(client, headers, "2026-08") == []


@pytest.mark.asyncio
async def test_the_withdrawal_raises_the_months_income_and_remainder(
    client: AsyncClient,
) -> None:
    headers = await _member(client)
    await _goal_with(client, headers, DEPOSIT, WITHDRAWAL)

    summary = await client.get("/api/v1/me/monthly-summary?period=2026-09", headers=headers)

    assert summary.json()["income_minor"] == 200_000
    assert summary.json()["remaining_minor"] == 200_000


@pytest.mark.asyncio
async def test_the_income_row_is_managed_from_savings(client: AsyncClient) -> None:
    headers = await _member(client)
    await _goal_with(client, headers, DEPOSIT, WITHDRAWAL)
    row_id = (await _income(client, headers, "2026-09"))[0]["id"]

    edited = await client.patch(
        f"/api/v1/me/transactions/{row_id}", json={"amount_minor": 1}, headers=headers
    )
    deleted = await client.delete(f"/api/v1/me/transactions/{row_id}", headers=headers)

    assert edited.status_code == 409
    assert deleted.status_code == 409


@pytest.mark.asyncio
async def test_the_income_row_does_not_leak_the_goal(client: AsyncClient) -> None:
    """Income and savings have separate visibility settings. Someone allowed
    to see your income in detail must not learn your goal's name or the note
    you wrote in savings from this row."""
    headers = await _member(client)
    await _goal_with(client, headers, DEPOSIT, WITHDRAWAL)

    row = (await _income(client, headers, "2026-09"))[0]

    assert row["name"] is None
    assert row["note"] is None


@pytest.mark.asyncio
async def test_the_category_cannot_be_picked_by_hand(client: AsyncClient) -> None:
    headers = await _member(client)

    categories = (await client.get("/api/v1/categories?kind=income", headers=headers)).json()

    retiro = next(c for c in categories if c["name"] == "Retiro de ahorro")
    assert retiro["is_reserved"] is True
    salario = next(c for c in categories if c["name"] == "Salario")
    assert salario["is_reserved"] is False
