"""A loan between family members moves money, so both ledgers show it.

Lending is money leaving the lender's pocket (an expense) and arriving in the
borrower's (income). Each repayment is the reverse. The rows are mirrored from
the loan and its payments, read-only, under the reserved category
"Préstamo familiar".
"""

import pytest
from httpx import AsyncClient

from tests.integration.test_loans import _two_members

CATEGORY = "Préstamo familiar"


async def _lend(client: AsyncClient, headers: dict, lender: str, borrower: str) -> str:
    created = await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": lender, "borrower_member_id": borrower,
            "amount_minor": 300_000, "lent_on": "2026-08-20", "note": "Para el SOAT",
        },
        headers=headers,
    )
    assert created.status_code == 201
    return str(created.json()["id"])


async def _ledger(client: AsyncClient, headers: dict, kind: str, period: str) -> list[dict]:
    listed = await client.get(
        f"/api/v1/me/transactions?kind={kind}&period={period}", headers=headers
    )
    return list(listed.json()["items"])


@pytest.mark.asyncio
async def test_lending_is_an_expense_for_the_lender(client: AsyncClient) -> None:
    daniel, _, daniel_id, papa_id = await _two_members(client)
    await _lend(client, daniel, daniel_id, papa_id)

    rows = await _ledger(client, daniel, "expense", "2026-08")

    assert len(rows) == 1
    assert rows[0]["amount_minor"] == 300_000
    assert rows[0]["occurred_on"] == "2026-08-20"
    assert rows[0]["source"] == "loan"
    assert [c["name"] for c in rows[0]["categories"]] == [CATEGORY]


@pytest.mark.asyncio
async def test_borrowing_is_income_for_the_borrower(client: AsyncClient) -> None:
    daniel, papa, daniel_id, papa_id = await _two_members(client)
    await _lend(client, daniel, daniel_id, papa_id)

    rows = await _ledger(client, papa, "income", "2026-08")

    assert len(rows) == 1
    assert rows[0]["amount_minor"] == 300_000
    assert rows[0]["source"] == "loan"


@pytest.mark.asyncio
async def test_a_repayment_runs_the_other_way(client: AsyncClient) -> None:
    daniel, papa, daniel_id, papa_id = await _two_members(client)
    loan_id = await _lend(client, daniel, daniel_id, papa_id)

    await client.post(
        f"/api/v1/loans/{loan_id}/payments",
        json={"amount_minor": 100_000, "paid_on": "2026-09-05"},
        headers=papa,
    )

    borrower_out = await _ledger(client, papa, "expense", "2026-09")
    lender_in = await _ledger(client, daniel, "income", "2026-09")
    assert [(r["amount_minor"], r["source"]) for r in borrower_out] == [
        (100_000, "loan_payment")
    ]
    assert [(r["amount_minor"], r["source"]) for r in lender_in] == [
        (100_000, "loan_payment")
    ]


@pytest.mark.asyncio
async def test_the_months_summary_reflects_it(client: AsyncClient) -> None:
    daniel, papa, daniel_id, papa_id = await _two_members(client)
    loan_id = await _lend(client, daniel, daniel_id, papa_id)
    await client.post(
        f"/api/v1/loans/{loan_id}/payments",
        json={"amount_minor": 100_000, "paid_on": "2026-09-05"},
        headers=papa,
    )

    august = (
        await client.get("/api/v1/me/monthly-summary?period=2026-08", headers=daniel)
    ).json()
    september = (
        await client.get("/api/v1/me/monthly-summary?period=2026-09", headers=daniel)
    ).json()

    assert august["expenses_minor"] == 300_000
    assert september["income_minor"] == 100_000


@pytest.mark.asyncio
async def test_the_rows_are_managed_from_loans(client: AsyncClient) -> None:
    daniel, _, daniel_id, papa_id = await _two_members(client)
    await _lend(client, daniel, daniel_id, papa_id)
    row_id = (await _ledger(client, daniel, "expense", "2026-08"))[0]["id"]

    edited = await client.patch(
        f"/api/v1/me/transactions/{row_id}", json={"amount_minor": 1}, headers=daniel
    )
    deleted = await client.delete(f"/api/v1/me/transactions/{row_id}", headers=daniel)

    assert edited.status_code == 409
    assert deleted.status_code == 409


@pytest.mark.asyncio
async def test_the_rows_do_not_leak_the_loan_into_other_modules(client: AsyncClient) -> None:
    """Loans resolve against the borrower's `debts` setting for third parties.
    The ledger rows resolve against income/expenses — so they carry neither
    the counterparty's name nor the loan's note (visibility-rules §5.3.1)."""
    daniel, papa, daniel_id, papa_id = await _two_members(client)
    await _lend(client, daniel, daniel_id, papa_id)

    for row in [
        *(await _ledger(client, daniel, "expense", "2026-08")),
        *(await _ledger(client, papa, "income", "2026-08")),
    ]:
        assert row["name"] is None
        assert row["note"] is None


@pytest.mark.asyncio
async def test_cancelling_a_loan_keeps_the_money_that_already_moved(
    client: AsyncClient,
) -> None:
    daniel, papa, daniel_id, papa_id = await _two_members(client)
    loan_id = await _lend(client, daniel, daniel_id, papa_id)

    await client.delete(f"/api/v1/loans/{loan_id}", headers=daniel)

    assert len(await _ledger(client, daniel, "expense", "2026-08")) == 1
    assert len(await _ledger(client, papa, "income", "2026-08")) == 1
