"""What the finance detail pages read: one record by id, and a debt's standing."""

from datetime import date, timedelta

import pytest
from httpx import AsyncClient


async def _member(client: AsyncClient, email: str = "daniel@example.com") -> dict[str, str]:
    registered = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery", "display_name": "Daniel"},
    )
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=headers)
    return headers


async def _expense(client: AsyncClient, headers: dict[str, str]) -> dict:
    categories = (await client.get("/api/v1/categories?kind=expense", headers=headers)).json()
    comida = next(c["id"] for c in categories if c["name"] == "Comida")
    created = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [comida], "amount_minor": 80_000,
            "occurred_on": "2026-08-12", "name": "Mercado", "payment_method": "nequi",
        },
        headers=headers,
    )
    return dict(created.json())


@pytest.mark.asyncio
async def test_a_transaction_can_be_read_by_id(client: AsyncClient) -> None:
    headers = await _member(client)
    created = await _expense(client, headers)

    response = await client.get(f"/api/v1/me/transactions/{created['id']}", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Mercado"
    assert body["payment_method"] == "nequi"
    assert [c["name"] for c in body["categories"]] == ["Comida"]


@pytest.mark.asyncio
async def test_someone_elses_transaction_is_not_found(client: AsyncClient) -> None:
    owner = await _member(client)
    created = await _expense(client, owner)
    other = await _member(client, "otro@example.com")

    response = await client.get(f"/api/v1/me/transactions/{created['id']}", headers=other)

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_a_savings_goal_can_be_read_by_id(client: AsyncClient) -> None:
    headers = await _member(client)
    goal = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Moto", "target_amount_minor": 1_000_000},
        headers=headers,
    )
    await client.post(
        f"/api/v1/me/savings-goals/{goal.json()['id']}/entries",
        json={"kind": "deposit", "amount_minor": 250_000, "occurred_on": "2026-08-10"},
        headers=headers,
    )

    response = await client.get(
        f"/api/v1/me/savings-goals/{goal.json()['id']}", headers=headers
    )

    assert response.status_code == 200
    assert response.json()["balance_minor"] == 250_000
    assert response.json()["progress"] == 0.25


@pytest.mark.asyncio
async def test_someone_elses_goal_is_not_found(client: AsyncClient) -> None:
    owner = await _member(client)
    goal = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Moto", "target_amount_minor": 1_000_000},
        headers=owner,
    )
    other = await _member(client, "otro@example.com")

    response = await client.get(f"/api/v1/me/savings-goals/{goal.json()['id']}", headers=other)

    assert response.status_code == 404


def _plan(first: date) -> dict:
    return {
        "name": "Celular", "creditor_type": "addi", "creditor_label": "Addi",
        "principal_minor": 300_000, "installments_total": 3,
        "installment_amount_minor": 100_000, "first_installment_on": first.isoformat(),
    }


@pytest.mark.asyncio
async def test_a_missed_installment_makes_the_debt_overdue(client: AsyncClient) -> None:
    headers = await _member(client)
    missed = date.today() - timedelta(days=10)
    await client.post("/api/v1/me/debts", json=_plan(missed), headers=headers)

    debt = (await client.get("/api/v1/me/debts", headers=headers)).json()[0]

    assert debt["standing"] == "overdue"
    assert debt["next_due_on"] == missed.isoformat()
    assert debt["progress"] == 0.0


@pytest.mark.asyncio
async def test_a_fully_paid_debt_stands_as_paid(client: AsyncClient) -> None:
    headers = await _member(client)
    created = await client.post(
        "/api/v1/me/debts", json=_plan(date.today() - timedelta(days=10)), headers=headers
    )
    await client.post(
        f"/api/v1/me/debts/{created.json()['id']}/payments",
        json={"amount_minor": 300_000, "paid_on": date.today().isoformat()},
        headers=headers,
    )

    detail = (
        await client.get(f"/api/v1/me/debts/{created.json()['id']}", headers=headers)
    ).json()

    assert detail["standing"] == "paid"
    assert detail["next_due_on"] is None
    assert detail["progress"] == 1.0
