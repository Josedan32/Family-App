import pytest
from httpx import AsyncClient


async def _two_members(client: AsyncClient) -> tuple[dict, dict, str, str]:
    """Returns (daniel_headers, papa_headers, daniel_member_id, papa_member_id)."""
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    daniel = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post(
        "/api/v1/households", json={"name": "Familia Hernández"}, headers=daniel
    )
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=daniel,
    )
    registered_papa = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "papa@example.com",
            "password": "correct-horse-battery",
            "display_name": "Papá",
        },
    )
    papa = {"Authorization": f"Bearer {registered_papa.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=papa
    )

    listed = await client.get("/api/v1/households/current", headers=daniel)
    members = listed.json()["members"]
    daniel_id = next(m["id"] for m in members if m["display_name"] == "Daniel")
    papa_id = next(m["id"] for m in members if m["display_name"] == "Papá")
    return daniel, papa, daniel_id, papa_id


@pytest.mark.asyncio
async def test_lender_can_create_a_loan(client: AsyncClient) -> None:
    """The spec's example: Daniel → Papá, $300.000, pendiente."""
    daniel, _, daniel_id, papa_id = await _two_members(client)

    response = await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id,
            "borrower_member_id": papa_id,
            "amount_minor": 300000,
            "lent_on": "2026-09-01",
        },
        headers=daniel,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["amount_minor"] == 300000
    assert body["status"] == "pending"
    assert body["perspective"] == "lender"


@pytest.mark.asyncio
async def test_both_parties_see_the_same_loan_from_their_own_side(
    client: AsyncClient,
) -> None:
    """FR-M2-13: one row, two perspectives, cannot disagree."""
    daniel, papa, daniel_id, papa_id = await _two_members(client)
    await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id, "borrower_member_id": papa_id,
            "amount_minor": 300000, "lent_on": "2026-09-01",
        },
        headers=daniel,
    )

    daniel_view = (await client.get("/api/v1/loans", headers=daniel)).json()
    papa_view = (await client.get("/api/v1/loans", headers=papa)).json()

    assert daniel_view[0]["id"] == papa_view[0]["id"]
    assert daniel_view[0]["perspective"] == "lender"
    assert papa_view[0]["perspective"] == "borrower"
    assert daniel_view[0]["outstanding_minor"] == papa_view[0]["outstanding_minor"]


@pytest.mark.asyncio
async def test_either_party_may_record_a_payment(client: AsyncClient) -> None:
    """FR-M2-14 / L-05."""
    daniel, papa, daniel_id, papa_id = await _two_members(client)
    created = await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id, "borrower_member_id": papa_id,
            "amount_minor": 300000, "lent_on": "2026-09-01",
        },
        headers=daniel,
    )
    loan_id = created.json()["id"]

    response = await client.post(
        f"/api/v1/loans/{loan_id}/payments",
        json={"amount_minor": 100000, "paid_on": "2026-09-20"},
        headers=papa,
    )
    assert response.status_code == 201

    daniel_view = (await client.get("/api/v1/loans", headers=daniel)).json()
    assert daniel_view[0]["outstanding_minor"] == 200000
    assert daniel_view[0]["status"] == "partially_paid"


@pytest.mark.asyncio
async def test_loan_detail_lists_its_payments(client: AsyncClient) -> None:
    daniel, papa, daniel_id, papa_id = await _two_members(client)
    created = await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id, "borrower_member_id": papa_id,
            "amount_minor": 300000, "lent_on": "2026-09-01",
        },
        headers=daniel,
    )
    loan_id = created.json()["id"]
    await client.post(
        f"/api/v1/loans/{loan_id}/payments",
        json={"amount_minor": 100000, "paid_on": "2026-09-20"},
        headers=papa,
    )

    response = await client.get(f"/api/v1/loans/{loan_id}", headers=daniel)

    assert response.status_code == 200
    body = response.json()
    assert body["outstanding_minor"] == 200000
    assert len(body["payments"]) == 1
    assert body["payments"][0]["amount_minor"] == 100000
    assert body["payments"][0]["paid_on"] == "2026-09-20"


@pytest.mark.asyncio
async def test_a_third_party_cannot_view_a_loan_detail_when_debts_are_private(
    client: AsyncClient,
) -> None:
    daniel, papa, daniel_id, papa_id = await _two_members(client)
    created = await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id, "borrower_member_id": papa_id,
            "amount_minor": 300000, "lent_on": "2026-09-01",
        },
        headers=daniel,
    )
    loan_id = created.json()["id"]

    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=daniel,
    )
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "mama@example.com",
            "password": "correct-horse-battery",
            "display_name": "Mamá",
        },
    )
    mama = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=mama
    )

    # Debts start private by default (FR-M3-03) — a third party sees nothing.
    response = await client.get(f"/api/v1/loans/{loan_id}", headers=mama)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_full_payment_marks_the_loan_paid_for_both(client: AsyncClient) -> None:
    """L-06."""
    daniel, papa, daniel_id, papa_id = await _two_members(client)
    created = await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id, "borrower_member_id": papa_id,
            "amount_minor": 300000, "lent_on": "2026-09-01",
        },
        headers=daniel,
    )
    loan_id = created.json()["id"]
    await client.post(
        f"/api/v1/loans/{loan_id}/payments",
        json={"amount_minor": 300000, "paid_on": "2026-09-20"},
        headers=papa,
    )

    for headers in (daniel, papa):
        view = (await client.get("/api/v1/loans", headers=headers)).json()
        assert view[0]["status"] == "paid"
        assert view[0]["outstanding_minor"] == 0


@pytest.mark.asyncio
async def test_only_the_lender_can_cancel(client: AsyncClient) -> None:
    """FR-M2-14."""
    daniel, papa, daniel_id, papa_id = await _two_members(client)
    created = await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id, "borrower_member_id": papa_id,
            "amount_minor": 300000, "lent_on": "2026-09-01",
        },
        headers=daniel,
    )
    loan_id = created.json()["id"]

    assert (await client.delete(f"/api/v1/loans/{loan_id}", headers=papa)).status_code == 403
    assert (await client.delete(f"/api/v1/loans/{loan_id}", headers=daniel)).status_code == 204


@pytest.mark.asyncio
async def test_a_member_cannot_create_a_loan_they_are_not_party_to(
    client: AsyncClient,
) -> None:
    daniel, papa, daniel_id, papa_id = await _two_members(client)
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=daniel,
    )
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "mama@example.com",
            "password": "correct-horse-battery",
            "display_name": "Mamá",
        },
    )
    mama = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=mama
    )

    response = await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id, "borrower_member_id": papa_id,
            "amount_minor": 300000, "lent_on": "2026-09-01",
        },
        headers=mama,
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_lender_and_borrower_cannot_be_the_same_member(client: AsyncClient) -> None:
    daniel, _, daniel_id, _ = await _two_members(client)

    response = await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id, "borrower_member_id": daniel_id,
            "amount_minor": 300000, "lent_on": "2026-09-01",
        },
        headers=daniel,
    )

    assert response.status_code == 422
