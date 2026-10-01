"""Migration 0028 against real legacy rows.

The dev and test databases had no `credit_card` debts when 0028 first ran, so
its backfill never executed. This builds a throwaway database, migrates it to
0027, seeds legacy debts through SQL (the ORM no longer knows the enum value),
then runs 0028 and inspects the result.
"""

import os
import subprocess
import sys
from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from family_api.config import get_settings

API_ROOT = Path(__file__).resolve().parents[2]
THROWAWAY_DB = "family_migration_0028"


def _url(database: str) -> str:
    url = make_url(get_settings().test_database_url).set(database=database)
    return url.render_as_string(hide_password=False)


def _alembic_upgrade(revision: str) -> None:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", revision],
        cwd=API_ROOT,
        env={**os.environ, "DATABASE_URL": _url(THROWAWAY_DB)},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr[-1500:]


async def _admin(*statements: str) -> None:
    admin = create_async_engine(_url("postgres"), isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        for statement in statements:
            await conn.execute(text(statement))
    await admin.dispose()


@pytest_asyncio.fixture
async def database_at_0027() -> AsyncIterator[str]:
    drop = f"DROP DATABASE IF EXISTS {THROWAWAY_DB} WITH (FORCE)"
    await _admin(drop, f"CREATE DATABASE {THROWAWAY_DB}")
    try:
        _alembic_upgrade("0027_credit_cards")
        yield _url(THROWAWAY_DB)
    finally:
        await _admin(drop)


async def _seed_member(conn: AsyncConnection) -> tuple[UUID, UUID]:
    user_id, household_id, member_id = uuid4(), uuid4(), uuid4()
    await conn.execute(
        text(
            "INSERT INTO users (id, email, password_hash, display_name) "
            "VALUES (:id, 'legacy@example.com', 'x', 'Legacy')"
        ),
        {"id": user_id},
    )
    await conn.execute(
        text("INSERT INTO households (id, name, created_by) VALUES (:id, 'Hogar', :user)"),
        {"id": household_id, "user": user_id},
    )
    await conn.execute(
        text(
            "INSERT INTO household_members (id, household_id, user_id, role) "
            "VALUES (:id, :hh, :user, 'admin')"
        ),
        {"id": member_id, "hh": household_id, "user": user_id},
    )
    return household_id, member_id


async def _seed_card_debt(
    conn: AsyncConnection,
    household_id: UUID,
    member_id: UUID,
    *,
    name: str,
    creditor_label: str,
    principal_minor: int,
    status: str,
    payments: list[tuple[int, date]],
) -> None:
    debt_id = uuid4()
    await conn.execute(
        text(
            "INSERT INTO debts (id, household_id, member_id, name, creditor_type, "
            "creditor_label, principal_minor, annual_interest_rate, due_day, status, "
            "created_at) "
            "VALUES (:id, :hh, :mem, :name, 'credit_card', :label, :principal, 24, 31, "
            "CAST(:status AS debt_status), '2026-01-05T12:00:00+00:00')"
        ),
        {
            "id": debt_id, "hh": household_id, "mem": member_id, "name": name,
            "label": creditor_label, "principal": principal_minor, "status": status,
        },
    )
    for amount_minor, paid_on in payments:
        await conn.execute(
            text(
                "INSERT INTO debt_payments (id, household_id, debt_id, amount_minor, paid_on) "
                "VALUES (:id, :hh, :debt, :amount, :paid_on)"
            ),
            {
                "id": uuid4(), "hh": household_id, "debt": debt_id,
                "amount": amount_minor, "paid_on": paid_on,
            },
        )


@pytest.mark.asyncio
async def test_0028_backfills_legacy_card_debts_faithfully(database_at_0027: str) -> None:
    engine = create_async_engine(database_at_0027)
    async with engine.begin() as conn:
        household_id, member_id = await _seed_member(conn)
        await _seed_card_debt(
            conn, household_id, member_id,
            name="Vieja", creditor_label="Davivienda", principal_minor=500_000,
            status="paid", payments=[(500_000, date(2026, 2, 1))],
        )
        await _seed_card_debt(
            conn, household_id, member_id,
            name="Celular", creditor_label="Bancolombia", principal_minor=1_000_000,
            status="active",
            payments=[(300_000, date(2026, 2, 1)), (200_000, date(2026, 3, 1))],
        )

    # due_day 31 used to violate ck_credit_card_cutoff_day and abort here.
    _alembic_upgrade("0028_drop_credit_card_debt_type")

    async with engine.connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM debts")) == 0
        assert await conn.scalar(text("SELECT count(*) FROM debt_payments")) == 0

        # The paid debt is gone without becoming a card.
        cards = (
            await conn.execute(
                text("SELECT id, nickname, bank_label, statement_cutoff_day FROM credit_cards")
            )
        ).all()
        assert len(cards) == 1
        card = cards[0]
        assert card.nickname == "Celular"
        assert card.bank_label == "Bancolombia"
        assert card.statement_cutoff_day == 28

        statement = (
            await conn.execute(
                text(
                    "SELECT purchases_total_minor, payments_total_minor, "
                    "closing_balance_minor, minimum_payment_minor "
                    "FROM credit_card_statements WHERE card_id = :card"
                ),
                {"card": card.id},
            )
        ).one()
        assert statement.purchases_total_minor == 1_000_000
        assert statement.payments_total_minor == 500_000
        assert statement.closing_balance_minor == 500_000
        assert statement.minimum_payment_minor == 500_000

        payments = (
            await conn.execute(
                text(
                    "SELECT amount_minor, paid_on, household_id FROM credit_card_payments "
                    "WHERE card_id = :card ORDER BY paid_on"
                ),
                {"card": card.id},
            )
        ).all()
        assert [(p.amount_minor, p.paid_on) for p in payments] == [
            (300_000, date(2026, 2, 1)),
            (200_000, date(2026, 3, 1)),
        ]
        assert all(p.household_id == household_id for p in payments)
    await engine.dispose()
