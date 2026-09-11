import pytest
from httpx import AsyncClient


async def _member(client: AsyncClient) -> dict[str, str]:
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=headers)
    return headers


ADDI = {
    "creditor_type": "addi",
    "creditor_label": "Addi - Celular",
    "principal_minor": 1_200_000,
    "installments_total": 12,
    "installment_amount_minor": 100_000,
    "first_installment_on": "2026-10-15",
}


@pytest.mark.asyncio
async def test_a_debt_can_carry_an_installment_plan(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.post("/api/v1/me/debts", json=ADDI, headers=headers)

    assert response.status_code == 201
    body = response.json()
    assert body["installments_total"] == 12
    assert body["installments_paid"] == 0
    assert body["installments_remaining"] == 12
    assert body["next_installment_on"] == "2026-10-15"
    assert body["next_installment_amount_minor"] == 100_000


@pytest.mark.asyncio
async def test_a_debt_without_a_plan_is_still_valid(client: AsyncClient) -> None:
    """FR-M2-19: a family loan should not be forced to invent a schedule."""
    headers = await _member(client)
    response = await client.post(
        "/api/v1/me/debts",
        json={
            "creditor_type": "family",
            "creditor_label": "Tío Jorge",
            "principal_minor": 500_000,
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["installments_total"] is None
    assert body["next_installment_on"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "partial",
    [
        {"installments_total": 12},
        {"installments_total": 12, "installment_amount_minor": 100_000},
        {"installment_amount_minor": 100_000, "first_installment_on": "2026-10-15"},
    ],
)
async def test_a_half_filled_plan_is_rejected(
    client: AsyncClient, partial: dict
) -> None:
    """FR-M2-17: all three or none. Half a schedule computes nothing useful."""
    headers = await _member(client)
    response = await client.post(
        "/api/v1/me/debts",
        json={
            "creditor_type": "addi",
            "creditor_label": "Addi",
            "principal_minor": 1_200_000,
            **partial,
        },
        headers=headers,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_payments_advance_the_schedule(client: AsyncClient) -> None:
    headers = await _member(client)
    created = await client.post("/api/v1/me/debts", json=ADDI, headers=headers)
    debt_id = created.json()["id"]

    for _ in range(2):
        await client.post(
            f"/api/v1/me/debts/{debt_id}/payments",
            json={"amount_minor": 100_000, "paid_on": "2026-10-15"},
            headers=headers,
        )

    listed = await client.get("/api/v1/me/debts", headers=headers)
    debt = listed.json()[0]

    assert debt["installments_paid"] == 2
    assert debt["installments_remaining"] == 10
    assert debt["next_installment_on"] == "2026-12-15"


@pytest.mark.asyncio
async def test_deleting_a_payment_moves_the_schedule_back(
    client: AsyncClient,
) -> None:
    """L-17: nothing is stale, because nothing is stored."""
    headers = await _member(client)
    created = await client.post("/api/v1/me/debts", json=ADDI, headers=headers)
    debt_id = created.json()["id"]
    payment = await client.post(
        f"/api/v1/me/debts/{debt_id}/payments",
        json={"amount_minor": 100_000, "paid_on": "2026-10-15"},
        headers=headers,
    )

    await client.delete(
        f"/api/v1/me/debts/{debt_id}/payments/{payment.json()['last_payment_id']}",
        headers=headers,
    )

    listed = await client.get("/api/v1/me/debts", headers=headers)
    assert listed.json()[0]["installments_paid"] == 0


@pytest.mark.asyncio
async def test_no_stored_installment_counter_exists() -> None:
    """L-16."""
    from family_api.db.models.debt import Debt

    columns = set(Debt.__table__.columns.keys())
    assert "installments_paid" not in columns
    assert "next_installment_on" not in columns
