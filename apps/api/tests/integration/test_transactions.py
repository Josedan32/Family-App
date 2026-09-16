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


@pytest.mark.asyncio
async def test_member_can_record_an_expense(client: AsyncClient) -> None:
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")

    response = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense",
            "category_id": category_id,
            "amount_minor": 15000,
            "occurred_on": "2026-09-02",
            "note": "Arroz 2kg",
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["amount_minor"] == 15000
    assert body["currency"] == "COP"
    assert body["source"] == "manual"


@pytest.mark.asyncio
async def test_expense_name_is_optional_and_persisted(client: AsyncClient) -> None:
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")

    response = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense",
            "category_id": category_id,
            "amount_minor": 15000,
            "occurred_on": "2026-09-02",
            "name": "Mercado de la semana",
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Mercado de la semana"

    listed = await client.get("/api/v1/me/transactions?kind=expense", headers=headers)
    assert listed.json()["items"][0]["name"] == "Mercado de la semana"


@pytest.mark.asyncio
async def test_expense_without_a_name_returns_null(client: AsyncClient) -> None:
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")

    response = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_id": category_id,
            "amount_minor": 15000, "occurred_on": "2026-09-02",
        },
        headers=headers,
    )

    assert response.json()["name"] is None


@pytest.mark.asyncio
async def test_amounts_must_be_positive(client: AsyncClient) -> None:
    """L-08: direction lives in `kind`, never in a sign."""
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")

    for amount in (0, -15000):
        response = await client.post(
            "/api/v1/me/transactions",
            json={
                "kind": "expense", "category_id": category_id,
                "amount_minor": amount, "occurred_on": "2026-09-02",
            },
            headers=headers,
        )
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_category_kind_must_match_transaction_kind(client: AsyncClient) -> None:
    """INV-D-04."""
    headers = await _member(client)
    salario = await _category(client, headers, "Salario", "income")

    response = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_id": salario,
            "amount_minor": 15000, "occurred_on": "2026-09-02",
        },
        headers=headers,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_transactions_are_listed_for_a_period(client: AsyncClient) -> None:
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")
    for day, amount in (("2026-09-02", 15000), ("2026-08-15", 99000)):
        await client.post(
            "/api/v1/me/transactions",
            json={
                "kind": "expense", "category_id": category_id,
                "amount_minor": amount, "occurred_on": day,
            },
            headers=headers,
        )

    response = await client.get(
        "/api/v1/me/transactions?kind=expense&period=2026-09", headers=headers
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["amount_minor"] == 15000


@pytest.mark.asyncio
async def test_member_can_edit_and_delete_their_own_transaction(
    client: AsyncClient,
) -> None:
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")
    created = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_id": category_id,
            "amount_minor": 15000, "occurred_on": "2026-09-02",
        },
        headers=headers,
    )
    transaction_id = created.json()["id"]

    patched = await client.patch(
        f"/api/v1/me/transactions/{transaction_id}",
        json={"amount_minor": 18000},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["amount_minor"] == 18000

    deleted = await client.delete(
        f"/api/v1/me/transactions/{transaction_id}", headers=headers
    )
    assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_a_member_cannot_touch_another_members_transaction(
    client: AsyncClient,
) -> None:
    """FR-M2-04: nobody edits another member's ledger, admin included."""
    daniel = await _member(client, "daniel@example.com")
    category_id = await _category(client, daniel, "Comida", "expense")
    created = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_id": category_id,
            "amount_minor": 15000, "occurred_on": "2026-09-02",
        },
        headers=daniel,
    )
    transaction_id = created.json()["id"]

    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=daniel,
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

    response = await client.patch(
        f"/api/v1/me/transactions/{transaction_id}",
        json={"amount_minor": 1},
        headers=papa,
    )

    assert response.status_code == 404
