"""The same fact, two surfaces, two rules.

FR-M4-07: a contribution is always visible to the household.
visibility-rules.md §5.2: the expense it generates is a NORMAL transaction and
resolves against the member's `expenses` setting like any other.

An implementer who "simplifies" this by making the derived expense always
visible breaks the privacy model. This test exists to stop that.
"""

import pytest
from httpx import AsyncClient

MODULES = ["income", "expenses", "savings", "debts"]


async def _setup(client: AsyncClient) -> tuple[dict, dict, str, str]:
    """Returns (admin_headers, papa_headers, papa_member_id, period_id)."""
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    admin = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=admin)
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=admin,
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
    period = await client.post(
        "/api/v1/contribution-periods",
        json={"period_month": "2026-09-01", "goal_amount_minor": 2_000_000},
        headers=admin,
    )
    listed = await client.get("/api/v1/households/current", headers=admin)
    papa_id = next(
        m["id"] for m in listed.json()["members"] if m["display_name"] == "Papá"
    )
    return admin, papa, papa_id, period.json()["id"]


@pytest.mark.asyncio
async def test_contribution_is_visible_while_the_expense_is_not(
    client: AsyncClient,
) -> None:
    """V-08. The crux of §5.2."""
    admin, papa, papa_id, period_id = await _setup(client)
    await client.put(
        "/api/v1/me/visibility", json={m: "private" for m in MODULES}, headers=papa
    )
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=papa,
    )

    # Surface 1: the household pot. Always visible (FR-M4-07).
    current = await client.get("/api/v1/contribution-periods/current", headers=admin)
    assert current.status_code == 200
    papa_row = next(
        m for m in current.json()["members"] if m["member_id"] == papa_id
    )
    assert papa_row["contributed_minor"] == 1_000_000

    # Surface 2: Papá's expense ledger. As private as he set it.
    expenses = await client.get(
        f"/api/v1/members/{papa_id}/expenses?period=2026-09", headers=admin
    )
    assert expenses.status_code == 403
    assert expenses.json()["type"] == "not_visible"


@pytest.mark.asyncio
async def test_the_mirrored_expense_counts_in_a_summary_total(
    client: AsyncClient,
) -> None:
    """FR-M3-05: a summary is the member's TRUE total, contributions included."""
    admin, papa, papa_id, period_id = await _setup(client)
    await client.put(
        "/api/v1/me/visibility",
        json={"income": "summary", "expenses": "summary",
              "savings": "summary", "debts": "private"},
        headers=papa,
    )
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=papa,
    )

    expenses = await client.get(
        f"/api/v1/members/{papa_id}/expenses?period=2026-09", headers=admin
    )

    assert expenses.status_code == 200
    assert expenses.json()["total_minor"] == 1_000_000


@pytest.mark.asyncio
async def test_a_guest_still_sees_the_household_pot(client: AsyncClient) -> None:
    """FR-M4-07 is not conditioned on role; guests observe household aggregates."""
    admin, papa, _, period_id = await _setup(client)
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "guest"},
        headers=admin,
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
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=papa,
    )

    response = await client.get(
        "/api/v1/contribution-periods/current", headers=guest
    )

    assert response.status_code == 200
    assert response.json()["collected_minor"] == 1_000_000


@pytest.mark.asyncio
async def test_a_guest_cannot_contribute(client: AsyncClient) -> None:
    """A guest has no ledger, so there is nothing to mirror into."""
    admin, _, _, period_id = await _setup(client)
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "guest"},
        headers=admin,
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
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 100_000, "paid_on": "2026-09-05"},
        headers=guest,
    )

    assert response.status_code == 403
