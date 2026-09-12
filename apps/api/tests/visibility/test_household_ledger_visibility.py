"""Same fact, two surfaces, two rules — for the third time.

FR-M4-15: the household ledger is always visible to the household.
FR-M4-16: the mirrored personal expense is a NORMAL transaction and resolves
against the payer's `expenses` setting.

An implementer who "simplifies" either direction breaks the model.
"""

import pytest
from httpx import AsyncClient

MODULES = ["income", "expenses", "savings", "debts"]


async def _setup(client: AsyncClient) -> tuple[dict, dict, str, str]:
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
    categories = await client.get("/api/v1/categories?kind=expense", headers=daniel)
    category_id = next(c["id"] for c in categories.json() if c["name"] == "Comida")
    members = await client.get("/api/v1/households/current", headers=daniel)
    mama_id = next(
        m["id"] for m in members.json()["members"] if m["display_name"] == "Mamá"
    )
    return daniel, mama, category_id, mama_id


@pytest.mark.asyncio
async def test_the_household_ledger_is_visible_while_the_payers_ledger_is_not(
    client: AsyncClient,
) -> None:
    daniel, mama, category_id, mama_id = await _setup(client)
    await client.put(
        "/api/v1/me/visibility", json={m: "private" for m in MODULES}, headers=mama
    )
    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 250_000,
            "occurred_on": "2026-09-07", "note": "Luz",
            "funding": "member", "paid_by_member_id": mama_id,
        },
        headers=mama,
    )

    # Surface 1: the household ledger. Always visible, including who paid.
    ledger = await client.get("/api/v1/household-expenses", headers=daniel)
    assert ledger.status_code == 200
    assert ledger.json()[0]["amount_minor"] == 250_000
    assert ledger.json()[0]["paid_by_name"] == "Mamá"

    # Surface 2: Mamá's personal expense ledger. As private as she set it.
    personal = await client.get(
        f"/api/v1/members/{mama_id}/expenses?period=2026-09", headers=daniel
    )
    assert personal.status_code == 403
    assert personal.json()["type"] == "not_visible"


@pytest.mark.asyncio
async def test_the_mirrored_expense_counts_in_a_summary_total(
    client: AsyncClient,
) -> None:
    """FR-M3-05: a summary is the member's TRUE total."""
    daniel, mama, category_id, mama_id = await _setup(client)
    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 250_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": mama_id,
        },
        headers=mama,
    )

    personal = await client.get(
        f"/api/v1/members/{mama_id}/expenses?period=2026-09", headers=daniel
    )

    assert personal.status_code == 200
    assert personal.json()["total_minor"] == 250_000


@pytest.mark.asyncio
async def test_a_guest_sees_the_household_ledger(client: AsyncClient) -> None:
    """A guest observes household aggregates; the ledger is one."""
    daniel, mama, category_id, mama_id = await _setup(client)
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "guest"},
        headers=daniel,
    )
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "tia@example.com",
            "password": "correct-horse-battery",
            "display_name": "Tía",
        },
    )
    guest = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=guest
    )
    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 250_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": mama_id,
        },
        headers=mama,
    )

    assert (
        await client.get("/api/v1/household-expenses", headers=guest)
    ).status_code == 200
    assert (
        await client.get("/api/v1/household-expenses/pot", headers=guest)
    ).status_code == 200


@pytest.mark.asyncio
async def test_a_guest_cannot_record_a_household_expense(client: AsyncClient) -> None:
    daniel, _, category_id, _ = await _setup(client)
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "guest"},
        headers=daniel,
    )
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "tio@example.com",
            "password": "correct-horse-battery",
            "display_name": "Tío",
        },
    )
    guest = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=guest
    )

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 100_000,
            "occurred_on": "2026-09-07", "funding": "pot",
        },
        headers=guest,
    )

    assert response.status_code == 403
