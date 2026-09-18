import pytest
from httpx import AsyncClient


async def _household_with_papa(client: AsyncClient) -> tuple[dict, dict, str]:
    """Returns (daniel_headers, papa_headers, papa_member_id)."""
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    daniel = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=daniel)
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=daniel,
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
    listed = await client.get("/api/v1/households/current", headers=daniel)
    papa_id = next(
        m["id"] for m in listed.json()["members"] if m["display_name"] == "Papá"
    )
    return daniel, papa, papa_id


async def _papa_earns(client: AsyncClient, papa: dict, amount: int) -> None:
    listed = await client.get("/api/v1/categories?kind=income", headers=papa)
    salario = next(c["id"] for c in listed.json() if c["name"] == "Salario")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "income", "category_ids": [salario],
            "amount_minor": amount, "occurred_on": "2026-09-05",
        },
        headers=papa,
    )


async def _set_visibility(client: AsyncClient, papa: dict, module: str, level: str) -> None:
    current = (await client.get("/api/v1/me/visibility", headers=papa)).json()
    payload = {m: current[m] for m in ("income", "expenses", "savings", "debts")}
    payload[module] = level
    await client.put("/api/v1/me/visibility", json=payload, headers=papa)


@pytest.mark.asyncio
async def test_summary_returns_one_number_and_nothing_else(client: AsyncClient) -> None:
    daniel, papa, papa_id = await _household_with_papa(client)
    await _papa_earns(client, papa, 3_000_000)

    response = await client.get(
        f"/api/v1/members/{papa_id}/income?period=2026-09", headers=daniel
    )

    assert response.status_code == 200
    assert set(response.json()) == {"period", "total_minor", "currency"}
    assert response.json()["total_minor"] == 3_000_000


@pytest.mark.asyncio
async def test_public_returns_the_transaction_list(client: AsyncClient) -> None:
    daniel, papa, papa_id = await _household_with_papa(client)
    await _papa_earns(client, papa, 3_000_000)
    await _set_visibility(client, papa, "income", "public")

    response = await client.get(
        f"/api/v1/members/{papa_id}/income?period=2026-09", headers=daniel
    )

    assert response.status_code == 200
    assert response.json()["items"][0]["categories"][0]["name"] == "Salario"


@pytest.mark.asyncio
async def test_private_returns_a_uniform_denial(client: AsyncClient) -> None:
    daniel, papa, papa_id = await _household_with_papa(client)
    await _papa_earns(client, papa, 3_000_000)
    await _set_visibility(client, papa, "income", "private")

    response = await client.get(
        f"/api/v1/members/{papa_id}/income?period=2026-09", headers=daniel
    )

    assert response.status_code == 403
    assert response.json()["type"] == "not_visible"


@pytest.mark.asyncio
async def test_debts_are_private_by_default(client: AsyncClient) -> None:
    """FR-M3-03."""
    daniel, _, papa_id = await _household_with_papa(client)
    response = await client.get(f"/api/v1/members/{papa_id}/debts", headers=daniel)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_a_member_with_no_records_returns_zero_not_a_denial(
    client: AsyncClient,
) -> None:
    """§3.2: zero and private must never be confusable."""
    daniel, _, papa_id = await _household_with_papa(client)

    response = await client.get(
        f"/api/v1/members/{papa_id}/income?period=2026-09", headers=daniel
    )

    assert response.status_code == 200
    assert response.json()["total_minor"] == 0


@pytest.mark.asyncio
async def test_monthly_summary_denies_when_any_module_is_private(client: AsyncClient) -> None:
    """FR-M3-03: debts defaults to private, so the composite summary must
    deny even when income/expenses/savings are left at their public defaults."""
    daniel, papa, papa_id = await _household_with_papa(client)
    await _papa_earns(client, papa, 3_000_000)

    response = await client.get(
        f"/api/v1/members/{papa_id}/monthly-summary?period=2026-09", headers=daniel
    )

    assert response.status_code == 403
    assert response.json()["type"] == "not_visible"


@pytest.mark.asyncio
async def test_monthly_summary_visible_once_every_module_is_shared(
    client: AsyncClient,
) -> None:
    daniel, papa, papa_id = await _household_with_papa(client)
    await _papa_earns(client, papa, 3_000_000)
    await _set_visibility(client, papa, "debts", "summary")

    response = await client.get(
        f"/api/v1/members/{papa_id}/monthly-summary?period=2026-09", headers=daniel
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "period", "currency", "income_minor", "expenses_minor",
        "saved_minor", "debt_payments_minor", "remaining_minor", "status",
    }
    assert body["income_minor"] == 3_000_000


@pytest.mark.asyncio
async def test_debt_detail_carries_installment_figures(client: AsyncClient) -> None:
    """The member-profile debt list needs the same derived figures as /me/debts."""
    daniel, papa, papa_id = await _household_with_papa(client)
    await _set_visibility(client, papa, "debts", "public")
    await client.post(
        "/api/v1/me/debts",
        json={
            "name": "Celular",
            "creditor_type": "addi",
            "creditor_label": "Addi - Celular",
            "principal_minor": 1_200_000,
            "installments_total": 12,
            "installment_amount_minor": 100_000,
            "first_installment_on": "2026-09-15",
        },
        headers=papa,
    )

    response = await client.get(f"/api/v1/members/{papa_id}/debts", headers=daniel)

    assert response.status_code == 200
    debt = response.json()[0]
    assert debt["installments_total"] == 12
    assert debt["installments_paid"] == 0
    assert debt["next_installment_on"] == "2026-09-15"
