import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.transaction_category import TransactionCategory


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
            "category_ids": [category_id],
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
    assert [c["id"] for c in body["categories"]] == [category_id]


@pytest.mark.asyncio
async def test_a_transaction_can_carry_more_than_one_category(client: AsyncClient) -> None:
    headers = await _member(client)
    comida = await _category(client, headers, "Comida", "expense")
    transporte = await _category(client, headers, "Transporte", "expense")

    response = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense",
            "category_ids": [comida, transporte],
            "amount_minor": 40000,
            "occurred_on": "2026-09-02",
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert {c["id"] for c in body["categories"]} == {comida, transporte}
    assert {c["name"] for c in body["categories"]} == {"Comida", "Transporte"}


@pytest.mark.asyncio
async def test_at_least_one_category_is_required(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [],
            "amount_minor": 15000, "occurred_on": "2026-09-02",
        },
        headers=headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_every_category_must_match_the_transaction_kind(client: AsyncClient) -> None:
    """INV-D-04, extended: no category in the set may mismatch the kind."""
    headers = await _member(client)
    comida = await _category(client, headers, "Comida", "expense")
    salario = await _category(client, headers, "Salario", "income")

    response = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [comida, salario],
            "amount_minor": 15000, "occurred_on": "2026-09-02",
        },
        headers=headers,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_editing_replaces_the_whole_category_set(client: AsyncClient) -> None:
    headers = await _member(client)
    comida = await _category(client, headers, "Comida", "expense")
    transporte = await _category(client, headers, "Transporte", "expense")
    created = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [comida],
            "amount_minor": 15000, "occurred_on": "2026-09-02",
        },
        headers=headers,
    )
    transaction_id = created.json()["id"]

    patched = await client.patch(
        f"/api/v1/me/transactions/{transaction_id}",
        json={"category_ids": [transporte]},
        headers=headers,
    )

    assert patched.status_code == 200
    assert [c["id"] for c in patched.json()["categories"]] == [transporte]


@pytest.mark.asyncio
async def test_filtering_by_category_matches_any_of_the_transactions_categories(
    client: AsyncClient,
) -> None:
    headers = await _member(client)
    comida = await _category(client, headers, "Comida", "expense")
    transporte = await _category(client, headers, "Transporte", "expense")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [comida, transporte],
            "amount_minor": 40000, "occurred_on": "2026-09-02",
        },
        headers=headers,
    )
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [comida],
            "amount_minor": 10000, "occurred_on": "2026-09-03",
        },
        headers=headers,
    )

    response = await client.get(
        f"/api/v1/me/transactions?kind=expense&category_id={transporte}", headers=headers
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["amount_minor"] == 40000


@pytest.mark.asyncio
async def test_the_period_total_never_double_counts_a_multi_category_transaction(
    client: AsyncClient,
) -> None:
    headers = await _member(client)
    comida = await _category(client, headers, "Comida", "expense")
    transporte = await _category(client, headers, "Transporte", "expense")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [comida, transporte],
            "amount_minor": 40000, "occurred_on": "2026-09-02",
        },
        headers=headers,
    )

    response = await client.get(
        "/api/v1/me/transactions?kind=expense&period=2026-09", headers=headers
    )

    assert sum(item["amount_minor"] for item in response.json()["items"]) == 40000


@pytest.mark.asyncio
async def test_deleting_a_transaction_removes_its_category_links(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")
    created = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [category_id],
            "amount_minor": 15000, "occurred_on": "2026-09-02",
        },
        headers=headers,
    )
    transaction_id = created.json()["id"]

    await client.delete(f"/api/v1/me/transactions/{transaction_id}", headers=headers)

    remaining = (
        await db_session.scalars(
            select(TransactionCategory).where(
                TransactionCategory.transaction_id == transaction_id
            )
        )
    ).all()
    assert remaining == []


@pytest.mark.asyncio
async def test_expense_name_is_optional_and_persisted(client: AsyncClient) -> None:
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")

    response = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense",
            "category_ids": [category_id],
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
            "kind": "expense", "category_ids": [category_id],
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
                "kind": "expense", "category_ids": [category_id],
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
            "kind": "expense", "category_ids": [salario],
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
                "kind": "expense", "category_ids": [category_id],
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
            "kind": "expense", "category_ids": [category_id],
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
            "kind": "expense", "category_ids": [category_id],
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
