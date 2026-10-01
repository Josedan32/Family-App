import pytest
from httpx import AsyncClient

CARD = {
    "nickname": "Visa", "bank_label": "Bancolombia", "credit_limit_minor": 5_000_000,
    "interest_rate_monthly_pct": 2.5, "minimum_payment_pct": 5,
    "statement_cutoff_day": 15, "payment_due_days": 15,
}
ADDI_DEBT = {
    "name": "Celular", "creditor_type": "addi", "creditor_label": "Addi - Celular",
    "principal_minor": 200_000, "due_day": 15,
}


async def _household_of_two(client: AsyncClient) -> tuple[dict[str, str], dict[str, str], str]:
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
        "/api/v1/households/current/invites", json={"role_granted": "admin"}, headers=daniel
    )
    registered2 = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "papa@example.com",
            "password": "correct-horse-battery",
            "display_name": "Papá",
        },
    )
    papa = {"Authorization": f"Bearer {registered2.json()['access_token']}"}
    await client.post("/api/v1/households/join", json={"code": invite.json()["code"]}, headers=papa)
    listed = await client.get("/api/v1/households/current", headers=daniel)
    daniel_member_id = next(
        m["id"] for m in listed.json()["members"] if m["display_name"] == "Daniel"
    )
    return daniel, papa, daniel_member_id


@pytest.mark.asyncio
async def test_admin_cannot_see_a_private_members_cards(client: AsyncClient) -> None:
    daniel, papa, daniel_member_id = await _household_of_two(client)
    await client.post("/api/v1/me/credit-cards", json=CARD, headers=daniel)

    # debts (and therefore credit_cards, same module) default to private.
    response = await client.get(
        f"/api/v1/members/{daniel_member_id}/credit-cards", headers=papa
    )
    assert response.status_code == 403
    assert response.json()["type"] == "not_visible"


@pytest.mark.asyncio
async def test_summary_visibility_combines_debts_and_cards_into_one_total(
    client: AsyncClient,
) -> None:
    daniel, papa, daniel_member_id = await _household_of_two(client)
    await client.put(
        "/api/v1/me/visibility",
        json={"income": "summary", "expenses": "summary", "savings": "summary", "debts": "summary"},
        headers=daniel,
    )
    created = await client.post("/api/v1/me/credit-cards", json=CARD, headers=daniel)
    card_id = created.json()["id"]
    await client.post(
        f"/api/v1/me/credit-cards/{card_id}/purchases",
        json={"description": "Mercado", "amount_minor": 100_000, "purchased_on": "2026-01-10"},
        headers=daniel,
    )
    await client.post("/api/v1/me/debts", json=ADDI_DEBT, headers=daniel)

    # Ground truth: read the actual card outstanding as the owner (FULL
    # visibility), so this assertion holds regardless of how many billing
    # cycles have elapsed between the purchase date and whenever this suite
    # happens to run — the combined total must always equal the sum of its
    # parts, whatever those parts currently are.
    own_card = await client.get(f"/api/v1/me/credit-cards/{card_id}", headers=daniel)
    card_outstanding = own_card.json()["outstanding_minor"]

    response = await client.get(f"/api/v1/members/{daniel_member_id}/debts", headers=papa)
    assert response.status_code == 200
    body = response.json()
    assert body["total_outstanding_minor"] == 200_000 + card_outstanding
