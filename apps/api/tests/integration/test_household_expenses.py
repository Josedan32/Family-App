import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household_expense import HouseholdExpense
from family_api.db.models.transaction import Transaction


async def _setup(client: AsyncClient) -> tuple[dict, dict, str, str, str]:
    """Returns (daniel, papa, period_id, category_id, papa_member_id)."""
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
        headers=daniel,
    )
    categories = await client.get("/api/v1/categories?kind=expense", headers=daniel)
    category_id = next(c["id"] for c in categories.json() if c["name"] == "Otros")
    members = await client.get("/api/v1/households/current", headers=daniel)
    papa_id = next(
        m["id"] for m in members.json()["members"] if m["display_name"] == "Papá"
    )
    return daniel, papa, period.json()["id"], category_id, papa_id


@pytest.mark.asyncio
async def test_a_pot_funded_expense_touches_no_personal_ledger(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    daniel, _, period_id, category_id, _ = await _setup(client)
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=daniel,
    )

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 400_000,
            "occurred_on": "2026-09-06", "note": "Servicios", "funding": "pot",
        },
        headers=daniel,
    )

    assert response.status_code == 201
    assert response.json()["expense_transaction_id"] is None

    mirrored = (
        await db_session.scalars(
            select(Transaction).where(Transaction.source == "household_expense")
        )
    ).all()
    assert mirrored == []


@pytest.mark.asyncio
async def test_household_expense_name_is_optional_and_persisted(client: AsyncClient) -> None:
    daniel, _, period_id, category_id, _ = await _setup(client)
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=daniel,
    )

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 400_000,
            "occurred_on": "2026-09-06", "name": "Factura de luz", "funding": "pot",
        },
        headers=daniel,
    )

    assert response.status_code == 201
    assert response.json()["name"] == "Factura de luz"

    listed = await client.get(
        "/api/v1/household-expenses?period=2026-09", headers=daniel
    )
    assert listed.json()[0]["name"] == "Factura de luz"


@pytest.mark.asyncio
async def test_a_pot_expense_cannot_overdraw_the_pot(client: AsyncClient) -> None:
    """FR-M4-14 / INV-D-09."""
    daniel, _, period_id, category_id, _ = await _setup(client)
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 100_000, "paid_on": "2026-09-05"},
        headers=daniel,
    )

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 500_000,
            "occurred_on": "2026-09-06", "funding": "pot",
        },
        headers=daniel,
    )

    assert response.status_code == 409
    assert response.json()["type"] == "insufficient_pot"


@pytest.mark.asyncio
async def test_a_member_funded_expense_mirrors_into_the_payers_ledger(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """FR-M4-11 / INV-D-07."""
    _, papa, _, category_id, papa_id = await _setup(client)

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 250_000,
            "occurred_on": "2026-09-07", "note": "Mercado",
            "funding": "member", "paid_by_member_id": papa_id,
        },
        headers=papa,
    )

    assert response.status_code == 201
    transaction_id = response.json()["expense_transaction_id"]
    assert transaction_id is not None

    transaction = await db_session.get(Transaction, transaction_id)
    assert transaction is not None
    assert transaction.kind == "expense"
    assert transaction.amount_minor == 250_000
    assert transaction.source == "household_expense"

    ledger = await client.get(
        "/api/v1/me/transactions?kind=expense&period=2026-09", headers=papa
    )
    assert len(ledger.json()["items"]) == 1


@pytest.mark.asyncio
async def test_the_mirrored_transaction_cannot_be_edited_directly(
    client: AsyncClient,
) -> None:
    """FR-M2-05 applies to this source too."""
    _, papa, _, category_id, papa_id = await _setup(client)
    created = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 250_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": papa_id,
        },
        headers=papa,
    )
    transaction_id = created.json()["expense_transaction_id"]

    response = await client.patch(
        f"/api/v1/me/transactions/{transaction_id}",
        json={"amount_minor": 1},
        headers=papa,
    )

    assert response.status_code == 409
    assert response.json()["type"] == "derived_record"


@pytest.mark.asyncio
async def test_a_member_cannot_record_an_expense_paid_by_someone_else(
    client: AsyncClient,
) -> None:
    daniel, papa, _, category_id, papa_id = await _setup(client)
    members = await client.get("/api/v1/households/current", headers=daniel)
    daniel_id = next(
        m["id"] for m in members.json()["members"] if m["display_name"] == "Daniel"
    )

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 100_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": daniel_id,
        },
        headers=papa,
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_amount_and_funding_are_immutable(client: AsyncClient) -> None:
    daniel, _, period_id, category_id, _ = await _setup(client)
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=daniel,
    )
    created = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 400_000,
            "occurred_on": "2026-09-06", "funding": "pot",
        },
        headers=daniel,
    )

    response = await client.patch(
        f"/api/v1/household-expenses/{created.json()['id']}",
        json={"amount_minor": 1, "funding": "member"},
        headers=daniel,
    )

    assert response.status_code in (200, 422)
    listed = await client.get("/api/v1/household-expenses", headers=daniel)
    assert listed.json()[0]["amount_minor"] == 400_000
    assert listed.json()[0]["funding"] == "pot"


@pytest.mark.asyncio
async def test_deleting_a_member_funded_expense_removes_both_rows(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, papa, _, category_id, papa_id = await _setup(client)
    created = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 250_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": papa_id,
        },
        headers=papa,
    )

    deleted = await client.delete(
        f"/api/v1/household-expenses/{created.json()['id']}", headers=papa
    )
    assert deleted.status_code == 204

    assert (await db_session.scalars(select(HouseholdExpense))).all() == []
    assert (
        await db_session.scalars(
            select(Transaction).where(Transaction.source == "household_expense")
        )
    ).all() == []


@pytest.mark.asyncio
async def test_member_funded_without_a_payer_defaults_to_the_caller(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """The web sheet has no payer picker — "Lo pagué yo" means the caller."""
    _, papa, _, category_id, papa_id = await _setup(client)

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 250_000,
            "occurred_on": "2026-09-07", "funding": "member",
        },
        headers=papa,
    )

    assert response.status_code == 201
    assert response.json()["paid_by_member_id"] == papa_id
