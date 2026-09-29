from datetime import date

import pytest
from httpx import AsyncClient

CARD = {
    "nickname": "Visa", "bank_label": "Bancolombia", "credit_limit_minor": 5_000_000,
    "interest_rate_monthly_pct": 2.5, "minimum_payment_pct": 5,
    "statement_cutoff_day": 15, "payment_due_days": 15,
}


@pytest.mark.asyncio
async def test_debt_and_card_payments_sum_into_one_bucket(client: AsyncClient) -> None:
    registered = await client.post(
        "/api/v1/auth/register",
        json={"email": "daniel@example.com", "password": "correct-horse-battery", "display_name": "Daniel"},
    )
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=headers)

    await client.post(
        "/api/v1/me/debts",
        json={"name": "Celular", "creditor_type": "addi", "creditor_label": "Addi",
              "principal_minor": 200_000},
        headers=headers,
    )
    debts = await client.get("/api/v1/me/debts", headers=headers)
    debt_id = debts.json()[0]["id"]
    await client.post(
        f"/api/v1/me/debts/{debt_id}/payments",
        json={"amount_minor": 50_000, "paid_on": "2026-01-05"},
        headers=headers,
    )

    card = await client.post("/api/v1/me/credit-cards", json=CARD, headers=headers)
    card_id = card.json()["id"]
    await client.post(
        f"/api/v1/me/credit-cards/{card_id}/purchases",
        json={"description": "Mercado", "amount_minor": 30_000, "purchased_on": "2026-01-10"},
        headers=headers,
    )
    await client.post(
        f"/api/v1/me/credit-cards/{card_id}/payments",
        json={"amount_minor": 30_000, "paid_on": "2026-01-11"},
        headers=headers,
    )

    summary = await client.get("/api/v1/me/monthly-summary?period=2026-01", headers=headers)
    assert summary.json()["debt_payments_minor"] == 80_000
