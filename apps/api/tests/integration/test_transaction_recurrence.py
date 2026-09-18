from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.transaction import Transaction
from family_api.ids import new_id


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
async def test_recurring_without_frequency_is_rejected_by_the_check(
    db_session: AsyncSession, make_user
) -> None:
    """DB-level backstop for the recurring/frequency invariant."""
    from family_api.services.households import create_household

    user = await make_user()
    household, member = await create_household(db_session, user, "Hogar")
    from sqlalchemy import select

    from family_api.db.models.seeded import Category

    category = (
        await db_session.scalars(
            select(Category).where(
                Category.household_id == household.id, Category.kind == "expense"
            )
        )
    ).first()

    db_session.add(
        Transaction(
            id=new_id(), household_id=household.id, member_id=member.id,
            kind="expense", category_id=category.id, amount_minor=15000,
            occurred_on=date(2026, 9, 2), source="manual",
            is_recurring=True, frequency=None, payment_method="cash",
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_frequency_without_recurring_is_rejected_by_the_check(
    db_session: AsyncSession, make_user
) -> None:
    from sqlalchemy import select

    from family_api.db.models.seeded import Category
    from family_api.services.households import create_household

    user = await make_user()
    household, member = await create_household(db_session, user, "Hogar")
    category = (
        await db_session.scalars(
            select(Category).where(
                Category.household_id == household.id, Category.kind == "expense"
            )
        )
    ).first()

    db_session.add(
        Transaction(
            id=new_id(), household_id=household.id, member_id=member.id,
            kind="expense", category_id=category.id, amount_minor=15000,
            occurred_on=date(2026, 9, 2), source="manual",
            is_recurring=False, frequency="monthly", payment_method="cash",
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_recurring_transaction_needs_a_frequency_at_the_api(client: AsyncClient) -> None:
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")

    response = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [category_id],
            "amount_minor": 15000, "occurred_on": "2026-09-02",
            "is_recurring": True,
        },
        headers=headers,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_frequency_without_recurring_is_rejected_at_the_api(client: AsyncClient) -> None:
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")

    response = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [category_id],
            "amount_minor": 15000, "occurred_on": "2026-09-02",
            "is_recurring": False, "frequency": "monthly",
        },
        headers=headers,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_created_transaction_carries_recurrence_and_payment_method(
    client: AsyncClient,
) -> None:
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")

    response = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [category_id],
            "amount_minor": 15000, "occurred_on": "2026-09-02",
            "is_recurring": True, "frequency": "monthly",
            "payment_method": "nequi",
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["is_recurring"] is True
    assert body["frequency"] == "monthly"
    assert body["payment_method"] == "nequi"


@pytest.mark.asyncio
async def test_defaults_are_non_recurring_and_cash(client: AsyncClient) -> None:
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

    assert response.status_code == 201
    body = response.json()
    assert body["is_recurring"] is False
    assert body["frequency"] is None
    assert body["payment_method"] == "cash"


@pytest.mark.asyncio
async def test_listed_transactions_carry_the_detail_fields(client: AsyncClient) -> None:
    """Detail responses (list + create) expose the three new fields."""
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_ids": [category_id],
            "amount_minor": 15000, "occurred_on": "2026-09-02",
            "is_recurring": True, "frequency": "biweekly",
            "payment_method": "bancolombia",
        },
        headers=headers,
    )

    response = await client.get(
        "/api/v1/me/transactions?kind=expense&period=2026-09", headers=headers
    )

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["is_recurring"] is True
    assert item["frequency"] == "biweekly"
    assert item["payment_method"] == "bancolombia"


@pytest.mark.asyncio
async def test_summary_response_never_grows_new_transaction_fields() -> None:
    """MoneyTotalResponse is the privacy-sensitive Summary variant: it stays
    period + total + currency only (docs/visibility-rules.md §3.1). The new
    fields belong on TransactionResponse (Detail), never here.
    """
    from family_api.schemas.transaction import MoneyTotalResponse

    assert set(MoneyTotalResponse.model_fields) == {"period", "total_minor", "currency"}
