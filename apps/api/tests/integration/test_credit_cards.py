from datetime import date
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.credit_card import CreditCard

CARD = {
    "nickname": "Visa", "bank_label": "Bancolombia", "credit_limit_minor": 5_000_000,
    "interest_rate_monthly_pct": 2.5, "minimum_payment_pct": 5,
    "statement_cutoff_day": 15, "payment_due_days": 15,
}


async def _member(client: AsyncClient, email: str = "daniel@example.com") -> dict[str, str]:
    registered = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery", "display_name": "Daniel"},
    )
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=headers)
    return headers


@pytest.mark.asyncio
async def test_member_can_register_a_card(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.post("/api/v1/me/credit-cards", json=CARD, headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert body["nickname"] == "Visa"
    assert body["outstanding_minor"] == 0
    assert body["latest_statement"] is None


@pytest.mark.asyncio
async def test_purchase_does_not_appear_as_an_expense(client: AsyncClient) -> None:
    headers = await _member(client)
    created = await client.post("/api/v1/me/credit-cards", json=CARD, headers=headers)
    card_id = created.json()["id"]

    await client.post(
        f"/api/v1/me/credit-cards/{card_id}/purchases",
        json={"description": "Mercado", "amount_minor": 100_000, "purchased_on": "2026-01-10"},
        headers=headers,
    )

    expenses = await client.get("/api/v1/me/transactions?kind=expense", headers=headers)
    assert expenses.json()["items"] == []


@pytest.mark.asyncio
async def test_cannot_view_another_members_card(client: AsyncClient) -> None:
    daniel = await _member(client, "daniel@example.com")
    created = await client.post("/api/v1/me/credit-cards", json=CARD, headers=daniel)
    card_id = created.json()["id"]
    invite = await client.post(
        "/api/v1/households/current/invites", json={"role_granted": "adult"}, headers=daniel
    )
    registered = await client.post(
        "/api/v1/auth/register",
        json={"email": "papa@example.com", "password": "correct-horse-battery", "display_name": "Papá"},
    )
    papa = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households/join", json={"code": invite.json()["code"]}, headers=papa)

    response = await client.get(f"/api/v1/me/credit-cards/{card_id}", headers=papa)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_deleting_a_billed_purchase_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _member(client)
    created = await client.post(
        "/api/v1/me/credit-cards",
        json={**CARD, "statement_cutoff_day": 5},
        headers=headers,
    )
    card_id = created.json()["id"]

    card = await db_session.get(CreditCard, UUID(card_id))
    await db_session.execute(
        card.__table__.update()
        .where(card.__table__.c.id == card.id)
        .values(created_at=date(2026, 1, 1))
    )
    await db_session.flush()
    await db_session.refresh(card)

    purchase = await client.post(
        f"/api/v1/me/credit-cards/{card_id}/purchases",
        json={"description": "Mercado", "amount_minor": 100_000, "purchased_on": "2026-01-01"},
        headers=headers,
    )
    purchase_id = purchase.json()["id"]
    # Reading the card after the cut-off has passed generates the statement.
    await client.get(f"/api/v1/me/credit-cards/{card_id}", headers=headers)

    response = await client.delete(
        f"/api/v1/me/credit-cards/{card_id}/purchases/{purchase_id}", headers=headers
    )
    assert response.status_code == 409
