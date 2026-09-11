"""visibility-rules.md §5.1.

Both parties always see their own loan (FR-M2-16). A THIRD member resolves it
against the borrower's `debts` setting — a loan is a debt from the household's
point of view, and the borrower is the one exposed by it.
"""

import pytest
from httpx import AsyncClient

MODULES = ["income", "expenses", "savings", "debts"]


async def _three_members(client: AsyncClient) -> tuple[dict, dict, dict, str, str]:
    """Returns (daniel, papa, mama, daniel_id, papa_id)."""
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

    async def _join(email: str, name: str) -> dict[str, str]:
        invite = await client.post(
            "/api/v1/households/current/invites",
            json={"role_granted": "adult"},
            headers=daniel,
        )
        response = await client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": "correct-horse-battery",
                  "display_name": name},
        )
        headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
        await client.post(
            "/api/v1/households/join",
            json={"code": invite.json()["code"]},
            headers=headers,
        )
        return headers

    papa = await _join("papa@example.com", "Papá")
    mama = await _join("mama@example.com", "Mamá")

    listed = await client.get("/api/v1/households/current", headers=daniel)
    members = listed.json()["members"]
    daniel_id = next(m["id"] for m in members if m["display_name"] == "Daniel")
    papa_id = next(m["id"] for m in members if m["display_name"] == "Papá")
    return daniel, papa, mama, daniel_id, papa_id


@pytest.mark.asyncio
async def test_a_third_member_is_denied_when_the_borrower_hides_debts(
    client: AsyncClient,
) -> None:
    daniel, papa, mama, daniel_id, papa_id = await _three_members(client)
    await client.put(
        "/api/v1/me/visibility", json={m: "private" for m in MODULES}, headers=papa
    )
    await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id, "borrower_member_id": papa_id,
            "amount_minor": 300_000, "lent_on": "2026-09-01",
        },
        headers=daniel,
    )

    response = await client.get("/api/v1/loans?scope=household", headers=mama)

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_a_third_member_sees_it_when_the_borrower_is_public(
    client: AsyncClient,
) -> None:
    daniel, papa, mama, daniel_id, papa_id = await _three_members(client)
    await client.put(
        "/api/v1/me/visibility", json={m: "public" for m in MODULES}, headers=papa
    )
    await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id, "borrower_member_id": papa_id,
            "amount_minor": 300_000, "lent_on": "2026-09-01",
        },
        headers=daniel,
    )

    response = await client.get("/api/v1/loans?scope=household", headers=mama)

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["amount_minor"] == 300_000


@pytest.mark.asyncio
async def test_the_lenders_own_setting_does_not_hide_the_loan_from_a_third(
    client: AsyncClient,
) -> None:
    """§5.1: the BORROWER's setting governs, because they are the exposed party."""
    daniel, papa, mama, daniel_id, papa_id = await _three_members(client)
    await client.put(
        "/api/v1/me/visibility", json={m: "private" for m in MODULES}, headers=daniel
    )
    await client.put(
        "/api/v1/me/visibility", json={m: "public" for m in MODULES}, headers=papa
    )
    await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id, "borrower_member_id": papa_id,
            "amount_minor": 300_000, "lent_on": "2026-09-01",
        },
        headers=daniel,
    )

    response = await client.get("/api/v1/loans?scope=household", headers=mama)

    assert len(response.json()) == 1


@pytest.mark.asyncio
async def test_parties_still_see_their_own_loan_in_household_scope(
    client: AsyncClient,
) -> None:
    """FR-M2-16 is not weakened by the household view."""
    daniel, papa, _, daniel_id, papa_id = await _three_members(client)
    await client.put(
        "/api/v1/me/visibility", json={m: "private" for m in MODULES}, headers=papa
    )
    await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id, "borrower_member_id": papa_id,
            "amount_minor": 300_000, "lent_on": "2026-09-01",
        },
        headers=daniel,
    )

    for headers in (daniel, papa):
        response = await client.get("/api/v1/loans?scope=household", headers=headers)
        assert len(response.json()) == 1


@pytest.mark.asyncio
async def test_a_guest_sees_no_loans(client: AsyncClient) -> None:
    """VR-02."""
    daniel, papa, _, daniel_id, papa_id = await _three_members(client)
    await client.put(
        "/api/v1/me/visibility", json={m: "public" for m in MODULES}, headers=papa
    )
    await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": daniel_id, "borrower_member_id": papa_id,
            "amount_minor": 300_000, "lent_on": "2026-09-01",
        },
        headers=daniel,
    )
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

    response = await client.get("/api/v1/loans?scope=household", headers=guest)

    assert response.json() == []
