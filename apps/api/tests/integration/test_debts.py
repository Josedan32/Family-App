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


ADDI_DEBT = {
    "creditor_type": "addi",
    "creditor_label": "Addi - Celular",
    "principal_minor": 1200000,
    "due_day": 15,
}


@pytest.mark.asyncio
async def test_member_can_record_an_addi_debt(client: AsyncClient) -> None:
    """Addi is a proper noun and a first-class creditor type (glossary §6)."""
    headers = await _member(client)
    response = await client.post("/api/v1/me/debts", json=ADDI_DEBT, headers=headers)

    assert response.status_code == 201
    body = response.json()
    assert body["creditor_type"] == "addi"
    assert body["outstanding_minor"] == 1200000
    assert body["status"] == "active"


@pytest.mark.asyncio
async def test_outstanding_is_principal_minus_payments(client: AsyncClient) -> None:
    """FR-M2-11: derived, never stored."""
    headers = await _member(client)
    created = await client.post("/api/v1/me/debts", json=ADDI_DEBT, headers=headers)
    debt_id = created.json()["id"]

    await client.post(
        f"/api/v1/me/debts/{debt_id}/payments",
        json={"amount_minor": 200000, "paid_on": "2026-09-15"},
        headers=headers,
    )

    listed = await client.get("/api/v1/me/debts", headers=headers)
    assert listed.json()[0]["outstanding_minor"] == 1000000


@pytest.mark.asyncio
async def test_debt_becomes_paid_at_zero_outstanding(client: AsyncClient) -> None:
    headers = await _member(client)
    created = await client.post("/api/v1/me/debts", json=ADDI_DEBT, headers=headers)
    debt_id = created.json()["id"]

    await client.post(
        f"/api/v1/me/debts/{debt_id}/payments",
        json={"amount_minor": 1200000, "paid_on": "2026-09-15"},
        headers=headers,
    )

    listed = await client.get("/api/v1/me/debts", headers=headers)
    debt = listed.json()[0]
    assert debt["outstanding_minor"] == 0
    assert debt["status"] == "paid"


@pytest.mark.asyncio
async def test_overpayment_is_rejected(client: AsyncClient) -> None:
    """L-07: outstanding never goes negative."""
    headers = await _member(client)
    created = await client.post("/api/v1/me/debts", json=ADDI_DEBT, headers=headers)
    debt_id = created.json()["id"]

    response = await client.post(
        f"/api/v1/me/debts/{debt_id}/payments",
        json={"amount_minor": 1300000, "paid_on": "2026-09-15"},
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["type"] == "overpayment"


@pytest.mark.asyncio
async def test_due_day_must_be_a_valid_day(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.post(
        "/api/v1/me/debts", json={**ADDI_DEBT, "due_day": 32}, headers=headers
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_debt_detail_lists_its_payments(client: AsyncClient) -> None:
    headers = await _member(client)
    created = await client.post("/api/v1/me/debts", json=ADDI_DEBT, headers=headers)
    debt_id = created.json()["id"]
    await client.post(
        f"/api/v1/me/debts/{debt_id}/payments",
        json={"amount_minor": 200000, "paid_on": "2026-09-15", "note": "Primera cuota"},
        headers=headers,
    )

    response = await client.get(f"/api/v1/me/debts/{debt_id}", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["outstanding_minor"] == 1000000
    assert len(body["payments"]) == 1
    assert body["payments"][0]["amount_minor"] == 200000
    assert body["payments"][0]["note"] == "Primera cuota"


@pytest.mark.asyncio
async def test_cannot_view_another_members_debt(client: AsyncClient) -> None:
    daniel = await _member(client)
    created = await client.post("/api/v1/me/debts", json=ADDI_DEBT, headers=daniel)
    debt_id = created.json()["id"]

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

    response = await client.get(f"/api/v1/me/debts/{debt_id}", headers=papa)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_can_delete_a_debt_with_no_payments(client: AsyncClient) -> None:
    headers = await _member(client)
    created = await client.post("/api/v1/me/debts", json=ADDI_DEBT, headers=headers)
    debt_id = created.json()["id"]

    response = await client.delete(f"/api/v1/me/debts/{debt_id}", headers=headers)

    assert response.status_code == 204
    listed = await client.get("/api/v1/me/debts", headers=headers)
    assert listed.json() == []


@pytest.mark.asyncio
async def test_cannot_delete_a_debt_with_payments(client: AsyncClient) -> None:
    """Deleting would silently erase a ledger trail — revert the payments first."""
    headers = await _member(client)
    created = await client.post("/api/v1/me/debts", json=ADDI_DEBT, headers=headers)
    debt_id = created.json()["id"]
    await client.post(
        f"/api/v1/me/debts/{debt_id}/payments",
        json={"amount_minor": 200000, "paid_on": "2026-09-15"},
        headers=headers,
    )

    response = await client.delete(f"/api/v1/me/debts/{debt_id}", headers=headers)

    assert response.status_code == 409
    assert response.json()["type"] == "debt_has_payments"
