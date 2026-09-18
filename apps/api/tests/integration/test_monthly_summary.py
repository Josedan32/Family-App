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


async def _category(client: AsyncClient, headers: dict[str, str], name: str, kind: str) -> str:
    listed = await client.get(f"/api/v1/categories?kind={kind}", headers=headers)
    return next(c["id"] for c in listed.json() if c["name"] == name)


async def _earn(client: AsyncClient, headers: dict[str, str], amount: int) -> None:
    if amount <= 0:
        return
    salario = await _category(client, headers, "Salario", "income")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "income", "category_ids": [salario],
            "amount_minor": amount, "occurred_on": "2026-09-05",
        },
        headers=headers,
    )


async def _spend(client: AsyncClient, headers: dict[str, str], amount: int) -> None:
    if amount <= 0:
        return
    comida = await _category(client, headers, "Comida", "expense")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [comida],
            "amount_minor": amount, "occurred_on": "2026-09-06",
        },
        headers=headers,
    )


async def _save(client: AsyncClient, headers: dict[str, str], amount: int) -> None:
    if amount <= 0:
        return
    goal = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Moto", "target_amount_minor": 10_000_000},
        headers=headers,
    )
    goal_id = goal.json()["id"]
    await client.post(
        f"/api/v1/me/savings-goals/{goal_id}/entries",
        json={"kind": "deposit", "amount_minor": amount, "occurred_on": "2026-09-07"},
        headers=headers,
    )


async def _pay_debt(client: AsyncClient, headers: dict[str, str], amount: int) -> None:
    if amount <= 0:
        return
    debt = await client.post(
        "/api/v1/me/debts",
        json={
            "name": "Celular", "creditor_type": "addi", "creditor_label": "Addi - Celular",
            "principal_minor": 5_000_000, "due_day": 15,
        },
        headers=headers,
    )
    debt_id = debt.json()["id"]
    await client.post(
        f"/api/v1/me/debts/{debt_id}/payments",
        json={"amount_minor": amount, "paid_on": "2026-09-08"},
        headers=headers,
    )


@pytest.mark.asyncio
async def test_healthy_status_when_plenty_remains(client: AsyncClient) -> None:
    headers = await _member(client)
    await _earn(client, headers, 1_000_000)
    await _spend(client, headers, 100_000)
    await _save(client, headers, 100_000)
    await _pay_debt(client, headers, 100_000)

    response = await client.get("/api/v1/me/monthly-summary?period=2026-09", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "period": "2026-09",
        "currency": "COP",
        "income_minor": 1_000_000,
        "expenses_minor": 100_000,
        "saved_minor": 100_000,
        "debt_payments_minor": 100_000,
        "remaining_minor": 700_000,
        "status": "healthy",
    }


@pytest.mark.asyncio
async def test_tight_status_when_remaining_is_under_ten_percent(client: AsyncClient) -> None:
    headers = await _member(client)
    await _earn(client, headers, 1_000_000)
    await _spend(client, headers, 950_000)

    response = await client.get("/api/v1/me/monthly-summary?period=2026-09", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["remaining_minor"] == 50_000
    assert body["status"] == "tight"


@pytest.mark.asyncio
async def test_overspent_status_when_remaining_is_negative(client: AsyncClient) -> None:
    headers = await _member(client)
    await _earn(client, headers, 500_000)
    await _spend(client, headers, 600_000)

    response = await client.get("/api/v1/me/monthly-summary?period=2026-09", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["remaining_minor"] == -100_000
    assert body["status"] == "overspent"


@pytest.mark.asyncio
async def test_zero_income_with_no_movement_is_healthy(client: AsyncClient) -> None:
    headers = await _member(client)

    response = await client.get("/api/v1/me/monthly-summary?period=2026-09", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["income_minor"] == 0
    assert body["remaining_minor"] == 0
    assert body["status"] == "healthy"


@pytest.mark.asyncio
async def test_zero_income_with_spending_is_overspent(client: AsyncClient) -> None:
    headers = await _member(client)
    await _spend(client, headers, 20_000)

    response = await client.get("/api/v1/me/monthly-summary?period=2026-09", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["income_minor"] == 0
    assert body["remaining_minor"] == -20_000
    assert body["status"] == "overspent"


@pytest.mark.asyncio
async def test_defaults_to_the_current_month_without_a_period(client: AsyncClient) -> None:
    headers = await _member(client)

    response = await client.get("/api/v1/me/monthly-summary", headers=headers)

    assert response.status_code == 200
    assert set(response.json()) == {
        "period", "currency", "income_minor", "expenses_minor",
        "saved_minor", "debt_payments_minor", "remaining_minor", "status",
    }
