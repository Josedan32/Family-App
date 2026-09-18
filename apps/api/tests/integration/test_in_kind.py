"""An in-kind contribution counts toward the GOAL but never toward the POT.

FR-M4-13. That money went pocket-to-expense and never arrived. Counting it into
the pot balance would report cash the household does not have — and the family
would then try to spend it.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.transaction import Transaction


async def _setup(client: AsyncClient) -> tuple[dict, dict, str, str, str]:
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
    registered_mama = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "mama@example.com",
            "password": "correct-horse-battery",
            "display_name": "Mamá",
        },
    )
    mama = {"Authorization": f"Bearer {registered_mama.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=mama
    )
    period = await client.post(
        "/api/v1/contribution-periods",
        json={"period_month": "2026-09-01", "goal_amount_minor": 2_000_000},
        headers=daniel,
    )
    categories = await client.get("/api/v1/categories?kind=expense", headers=daniel)
    category_id = next(c["id"] for c in categories.json() if c["name"] == "Comida")
    members = await client.get("/api/v1/households/current", headers=daniel)
    mama_id = next(
        m["id"] for m in members.json()["members"] if m["display_name"] == "Mamá"
    )
    return daniel, mama, period.json()["id"], category_id, mama_id


@pytest.mark.asyncio
async def test_in_kind_counts_toward_the_goal(client: AsyncClient) -> None:
    daniel, mama, _, category_id, mama_id = await _setup(client)

    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 600_000,
            "occurred_on": "2026-09-07", "note": "Mercado del mes",
            "funding": "member", "paid_by_member_id": mama_id,
            "counts_as_contribution": True,
        },
        headers=mama,
    )

    current = await client.get("/api/v1/contribution-periods/current", headers=daniel)
    assert current.json()["collected_minor"] == 600_000
    row = next(
        m for m in current.json()["members"] if m["member_id"] == mama_id
    )
    assert row["contributed_minor"] == 600_000


@pytest.mark.asyncio
async def test_in_kind_never_enters_the_pot(client: AsyncClient) -> None:
    """L-14. The crux of FR-M4-13."""
    daniel, mama, _, category_id, mama_id = await _setup(client)

    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 600_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": mama_id, "counts_as_contribution": True,
        },
        headers=mama,
    )

    pot = await client.get("/api/v1/household-expenses/pot", headers=daniel)

    assert pot.json()["collected_minor"] == 0
    assert pot.json()["spent_minor"] == 0
    assert pot.json()["balance_minor"] == 0


@pytest.mark.asyncio
async def test_the_money_leaves_the_members_ledger_exactly_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """L-13 / INV-D-08: one transaction, referenced from two places."""
    _, mama, _, category_id, mama_id = await _setup(client)

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 600_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": mama_id, "counts_as_contribution": True,
        },
        headers=mama,
    )

    body = response.json()
    assert body["expense_transaction_id"] is not None
    assert body["contribution_id"] is not None

    mirrored = (
        await db_session.scalars(
            select(Transaction).where(Transaction.member_id == mama_id)
        )
    ).all()
    assert len(mirrored) == 1
    assert mirrored[0].amount_minor == 600_000

    ledger = await client.get(
        "/api/v1/me/transactions?kind=expense&period=2026-09", headers=mama
    )
    assert len(ledger.json()["items"]) == 1


@pytest.mark.asyncio
async def test_in_kind_requires_an_open_period(client: AsyncClient) -> None:
    daniel, mama, period_id, category_id, mama_id = await _setup(client)
    await client.post(f"/api/v1/contribution-periods/{period_id}/close", headers=daniel)

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 600_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": mama_id, "counts_as_contribution": True,
        },
        headers=mama,
    )

    assert response.status_code == 409
    assert response.json()["type"] == "no_open_period"


@pytest.mark.asyncio
async def test_pot_funded_expenses_cannot_be_in_kind(client: AsyncClient) -> None:
    """Pot money is already a contribution; counting it again double-counts."""
    daniel, _, _, category_id, _ = await _setup(client)

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 100_000,
            "occurred_on": "2026-09-07", "funding": "pot",
            "counts_as_contribution": True,
        },
        headers=daniel,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_deleting_an_in_kind_expense_removes_all_three_rows(
    client: AsyncClient,
) -> None:
    daniel, mama, _, category_id, mama_id = await _setup(client)
    created = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 600_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": mama_id, "counts_as_contribution": True,
        },
        headers=mama,
    )

    await client.delete(
        f"/api/v1/household-expenses/{created.json()['id']}", headers=mama
    )

    current = await client.get("/api/v1/contribution-periods/current", headers=daniel)
    assert current.json()["collected_minor"] == 0

    ledger = await client.get(
        "/api/v1/me/transactions?kind=expense&period=2026-09", headers=mama
    )
    assert ledger.json()["items"] == []


@pytest.mark.asyncio
async def test_the_payers_ledger_row_keeps_the_name_and_payment_method(
    client: AsyncClient,
) -> None:
    """Recorded from the personal expense form as "this was my contribution":
    the row in the payer's own ledger must read like any expense they logged."""
    _, mama, _, category_id, _ = await _setup(client)

    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 600_000,
            "occurred_on": "2026-09-07", "name": "Mercado", "note": "D1",
            "funding": "member", "counts_as_contribution": True,
            "payment_method": "nequi",
        },
        headers=mama,
    )

    ledger = await client.get(
        "/api/v1/me/transactions?kind=expense&period=2026-09", headers=mama
    )
    row = ledger.json()["items"][0]
    assert row["name"] == "Mercado"
    assert row["payment_method"] == "nequi"
    assert row["source"] == "household_expense"


@pytest.mark.asyncio
async def test_a_pot_funded_expense_takes_no_payment_method(client: AsyncClient) -> None:
    daniel, _, _, category_id, _ = await _setup(client)

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 1_000,
            "occurred_on": "2026-09-07", "funding": "pot",
            "payment_method": "nequi",
        },
        headers=daniel,
    )

    assert response.status_code == 422
