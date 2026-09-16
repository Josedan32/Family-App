import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.contribution import Contribution
from family_api.db.models.transaction import Transaction


async def _household_with_period(client: AsyncClient) -> tuple[dict, dict, str]:
    """Returns (admin_headers, papa_headers, period_id)."""
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    admin = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post(
        "/api/v1/households", json={"name": "Familia Hernández"}, headers=admin
    )
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
    return admin, papa, period.json()["id"]


@pytest.mark.asyncio
async def test_recording_a_contribution_creates_exactly_one_linked_expense(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """L-01 / INV-D-01."""
    _, papa, period_id = await _household_with_period(client)

    response = await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=papa,
    )
    assert response.status_code == 201

    contributions = (await db_session.scalars(select(Contribution))).all()
    assert len(contributions) == 1

    transactions = (
        await db_session.scalars(
            select(Transaction).where(Transaction.source == "contribution")
        )
    ).all()
    assert len(transactions) == 1

    contribution, transaction = contributions[0], transactions[0]
    assert contribution.expense_transaction_id == transaction.id
    assert transaction.source_id == contribution.id
    assert transaction.kind == "expense"
    assert transaction.amount_minor == 1_000_000
    assert transaction.member_id == contribution.member_id


@pytest.mark.asyncio
async def test_the_mirrored_expense_uses_the_aporte_al_hogar_category(
    client: AsyncClient,
) -> None:
    _, papa, period_id = await _household_with_period(client)
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=papa,
    )

    ledger = await client.get(
        "/api/v1/me/transactions?kind=expense&period=2026-09", headers=papa
    )
    assert ledger.json()["items"][0]["categories"][0]["name"] == "Aporte al hogar"


@pytest.mark.asyncio
async def test_the_mirrored_expense_cannot_be_edited_or_deleted_directly(
    client: AsyncClient,
) -> None:
    """L-04 / FR-M2-05."""
    _, papa, period_id = await _household_with_period(client)
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=papa,
    )
    ledger = await client.get(
        "/api/v1/me/transactions?kind=expense&period=2026-09", headers=papa
    )
    transaction_id = ledger.json()["items"][0]["id"]

    patched = await client.patch(
        f"/api/v1/me/transactions/{transaction_id}",
        json={"amount_minor": 1},
        headers=papa,
    )
    assert patched.status_code == 409
    assert patched.json()["type"] == "derived_record"

    deleted = await client.delete(
        f"/api/v1/me/transactions/{transaction_id}", headers=papa
    )
    assert deleted.status_code == 409


@pytest.mark.asyncio
async def test_deleting_a_contribution_removes_both_rows(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """L-03 / FR-M4-06."""
    _, papa, period_id = await _household_with_period(client)
    created = await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=papa,
    )
    contribution_id = created.json()["id"]

    deleted = await client.delete(
        f"/api/v1/contributions/{contribution_id}", headers=papa
    )
    assert deleted.status_code == 204

    assert (await db_session.scalars(select(Contribution))).all() == []
    assert (
        await db_session.scalars(
            select(Transaction).where(Transaction.source == "contribution")
        )
    ).all() == []


@pytest.mark.asyncio
async def test_member_can_list_their_own_contributions_for_a_period(client: AsyncClient) -> None:
    _, papa, period_id = await _household_with_period(client)
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 500_000, "paid_on": "2026-09-05"},
        headers=papa,
    )
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 300_000, "paid_on": "2026-09-12"},
        headers=papa,
    )

    response = await client.get(
        f"/api/v1/contribution-periods/{period_id}/contributions/mine", headers=papa
    )

    assert response.status_code == 200
    amounts = sorted(c["amount_minor"] for c in response.json())
    assert amounts == [300_000, 500_000]


@pytest.mark.asyncio
async def test_editing_a_contribution_updates_the_mirrored_expense_atomically(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Same discipline as create/delete (INV-D-01): both rows change together."""
    _, papa, period_id = await _household_with_period(client)
    created = await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=papa,
    )
    contribution_id = created.json()["id"]

    response = await client.patch(
        f"/api/v1/contributions/{contribution_id}",
        json={"amount_minor": 1_200_000, "note": "Ajuste"},
        headers=papa,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["amount_minor"] == 1_200_000
    assert body["note"] == "Ajuste"

    transaction = await db_session.scalar(
        select(Transaction).where(Transaction.id == body["expense_transaction_id"])
    )
    assert transaction is not None
    assert transaction.amount_minor == 1_200_000
    assert transaction.note == "Ajuste"

    # L-04 still holds: the mirror stays off-limits to direct edits.
    direct = await client.patch(
        f"/api/v1/me/transactions/{transaction.id}",
        json={"amount_minor": 1},
        headers=papa,
    )
    assert direct.status_code == 409
    assert direct.json()["type"] == "derived_record"


@pytest.mark.asyncio
async def test_amount_must_stay_positive_when_editing(client: AsyncClient) -> None:
    _, papa, period_id = await _household_with_period(client)
    created = await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=papa,
    )
    contribution_id = created.json()["id"]

    response = await client.patch(
        f"/api/v1/contributions/{contribution_id}",
        json={"amount_minor": -1},
        headers=papa,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_a_member_cannot_edit_another_members_contribution(client: AsyncClient) -> None:
    admin, papa, period_id = await _household_with_period(client)
    created = await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=papa,
    )
    contribution_id = created.json()["id"]

    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "mama@example.com",
            "password": "correct-horse-battery",
            "display_name": "Mamá",
        },
    )
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=admin,
    )
    mama = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=mama
    )

    response = await client.patch(
        f"/api/v1/contributions/{contribution_id}",
        json={"amount_minor": 1},
        headers=mama,
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_the_period_dashboard_reports_the_spec_example(
    client: AsyncClient,
) -> None:
    """FR-M4-04: target 2.000.000, collected 1.900.000, 95%."""
    admin, papa, period_id = await _household_with_period(client)

    listed = await client.get("/api/v1/households/current", headers=admin)
    members = listed.json()["members"]
    papa_id = next(m["id"] for m in members if m["display_name"] == "Papá")
    daniel_id = next(m["id"] for m in members if m["display_name"] == "Daniel")

    await client.put(
        f"/api/v1/contribution-periods/{period_id}/pledges",
        json={
            "pledges": [
                {"member_id": papa_id, "expected_amount_minor": 1_000_000},
                {"member_id": daniel_id, "expected_amount_minor": 1_000_000},
            ]
        },
        headers=admin,
    )
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=papa,
    )
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 900_000, "paid_on": "2026-09-06"},
        headers=admin,
    )

    current = await client.get("/api/v1/contribution-periods/current", headers=admin)
    body = current.json()

    assert body["goal_amount_minor"] == 2_000_000
    assert body["collected_minor"] == 1_900_000
    assert body["progress"] == pytest.approx(0.95)


@pytest.mark.asyncio
async def test_a_closed_period_rejects_new_contributions(client: AsyncClient) -> None:
    """FR-M4-08."""
    admin, papa, period_id = await _household_with_period(client)
    await client.post(f"/api/v1/contribution-periods/{period_id}/close", headers=admin)

    response = await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=papa,
    )

    assert response.status_code == 409
    assert response.json()["type"] == "period_closed"
