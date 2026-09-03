# Household Ledger & Installments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two gaps in the Phase 1 financial spine — the household collects money it cannot account for, and a debt is a balance rather than a payment falling due on a day. Build the household's own expense ledger (FR-M4-09…16) and optional debt installment plans (FR-M2-17…19).

**Architecture:** Same four layers. The defining work is a second atomic mirror: a member-funded household expense writes the household row **and** the payer's personal transaction in one transaction, and when marked in kind also creates a `Contribution` pointing at that **same** transaction — one transaction referenced from two places, so the money leaves the member's ledger exactly once.

**Tech Stack:** Unchanged.

**Spec:** `docs/superpowers/specs/2026-09-02-family-hub-design.md` §6.4 (contribution *and ledger*), §6.2 (FR-M2-17…19)

**Depends on:** Plans 1, 2 and 3. Plan 4 only for the two UI tasks at the end.

**Also read:** `docs/visibility-rules.md` **§5.2 and §5.3** — this plan creates the second instance of the "same fact, two surfaces, two rules" shape, and getting it wrong leaks a private ledger. Then `docs/data-model.md` §8B, `docs/api-contract.md` §11–12.

---

## Global Constraints

Everything from Plans 1–3 still applies. The ones this plan turns on:

- **Money is `BIGINT` minor units. Never `float`.** COP has 0 minor units.
- **All amounts strictly positive.** Direction lives in a kind column.
- **`pot_balance` is derived, never stored** (FR-M4-13). So are all installment figures (FR-M2-18). A stored counter drifts the moment an underlying row is edited.
- **An in-kind contribution counts toward the period goal but NEVER toward the pot balance.** That money went pocket-to-expense and never arrived.
- **Household expenses are always visible to the whole household** (FR-M4-15) — amount, category, date, note **and who paid**.
- **The mirrored personal transaction is a normal transaction** (FR-M4-16) and resolves against the payer's `expenses` setting. Same fact, two surfaces, two rules.
- **A pot-funded expense may never drive the pot negative** (FR-M4-14), checked under a row lock.
- **Code English, UI Spanish (`es-CO`).** A `household_expense` is never called a `transaction` — see `docs/glossary.md` §3.
- **Tests against real PostgreSQL 16.**
- **Commits:** `<type>(<scope>): <subject>`, imperative, ≤ 50 chars, no period.

### Interfaces inherited

```python
family_api.ids.new_id() -> UUID
family_api.errors.{DomainError, NotFoundError, ForbiddenRoleError}
family_api.periods.{parse_period, month_bounds, current_period}
family_api.db.models.household.{Household, HouseholdMember}
family_api.db.models.seeded.Category
family_api.db.models.transaction.Transaction          # .source .source_id
family_api.db.models.debt.{Debt, DebtPayment}
family_api.db.models.contribution.{Contribution, ContributionPeriod}
family_api.services.members.{CurrentMember, require_admin}
family_api.services.contributions.get_open_period(session, household_id)
family_api.services.debts.list_debts_with_outstanding(session, member_id)
family_api.services.visibility.{Level, resolve, visibility_for}
```

---

## File Structure

```
apps/api/
├── migrations/versions/
│   ├── 0009_debt_installments.py
│   └── 0010_household_expenses.py
├── src/family_api/
│   ├── dates.py                          # add_months
│   ├── db/models/household_expense.py    # HouseholdExpense
│   ├── schemas/household_expense.py
│   ├── services/
│   │   ├── installments.py               # derived installment figures
│   │   └── household_expenses.py         # THE second atomic mirror
│   └── routers/household_expenses.py
└── tests/
    ├── unit/{test_dates,test_installments}.py
    ├── integration/{test_debt_installments,test_household_expenses,test_pot_balance,test_in_kind}.py
    └── visibility/test_household_ledger_visibility.py

apps/web/src/
├── app/(app)/hogar/gastos/page.tsx
└── components/finance/{HouseholdExpenseRow,PotBalanceCard,InstallmentSummary}.tsx
```

---

### Task 1: Month arithmetic and derived installment figures

**Files:**
- Create: `apps/api/src/family_api/dates.py`, `apps/api/src/family_api/services/installments.py`
- Test: `apps/api/tests/unit/test_dates.py`, `apps/api/tests/unit/test_installments.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `add_months(start: date, months: int) -> date`; `InstallmentFigures` dataclass with `total`, `paid`, `remaining`, `next_on`, `next_amount_minor`, `is_overdue`; `compute_installments(total, amount_minor, first_on, paid_total, today) -> InstallmentFigures | None`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/unit/test_dates.py`:

```python
from datetime import date

import pytest

from family_api.dates import add_months


def test_adds_within_the_same_year() -> None:
    assert add_months(date(2026, 1, 15), 2) == date(2026, 3, 15)


def test_rolls_over_the_year() -> None:
    assert add_months(date(2026, 11, 15), 3) == date(2027, 2, 15)


def test_clamps_to_the_last_day_of_a_shorter_month() -> None:
    """A debt due on the 31st is due on the 28th in February, not in March."""
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)


def test_clamps_correctly_in_a_leap_year() -> None:
    assert add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)


def test_zero_months_is_identity() -> None:
    assert add_months(date(2026, 9, 3), 0) == date(2026, 9, 3)


@pytest.mark.parametrize("months", [1, 6, 12, 24])
def test_never_skips_a_month(months: int) -> None:
    start = date(2026, 3, 30)
    result = add_months(start, months)
    expected_month = (start.month - 1 + months) % 12 + 1
    assert result.month == expected_month
```

Create `apps/api/tests/unit/test_installments.py`:

```python
from datetime import date

from family_api.services.installments import compute_installments

TODAY = date(2026, 12, 20)


def test_a_debt_without_a_plan_has_no_figures() -> None:
    assert compute_installments(None, None, None, 0, TODAY) is None


def test_nothing_paid_yet() -> None:
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 0, TODAY)
    assert figures is not None
    assert figures.paid == 0
    assert figures.remaining == 12
    assert figures.next_on == date(2026, 10, 15)
    assert figures.next_amount_minor == 100_000


def test_two_installments_paid() -> None:
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 200_000, TODAY)
    assert figures is not None
    assert figures.paid == 2
    assert figures.remaining == 10
    assert figures.next_on == date(2026, 12, 15)


def test_a_partial_payment_does_not_advance_the_schedule() -> None:
    """Half a cuota is not a cuota. Rounding down keeps the debt honest."""
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 150_000, TODAY)
    assert figures is not None
    assert figures.paid == 1


def test_overdue_when_the_next_date_has_passed() -> None:
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 100_000, TODAY)
    assert figures is not None
    assert figures.next_on == date(2026, 11, 15)
    assert figures.is_overdue is True


def test_not_overdue_when_the_next_date_is_ahead() -> None:
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 300_000, TODAY)
    assert figures is not None
    assert figures.is_overdue is False


def test_a_fully_paid_plan_has_no_next_installment() -> None:
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 1_200_000, TODAY)
    assert figures is not None
    assert figures.remaining == 0
    assert figures.next_on is None
    assert figures.is_overdue is False


def test_overpayment_never_reports_more_than_the_total() -> None:
    figures = compute_installments(12, 100_000, date(2026, 10, 15), 9_999_999, TODAY)
    assert figures is not None
    assert figures.paid == 12
    assert figures.remaining == 0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/unit/test_dates.py tests/unit/test_installments.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.dates'`

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/family_api/dates.py`:

```python
"""Calendar arithmetic that respects short months.

A debt due on the 31st is due on the 28th in February. Adding 30 days instead
of a month drifts the due date a little further every cycle until it lands in
the wrong month entirely.
"""

import calendar
from datetime import date


def add_months(start: date, months: int) -> date:
    total = start.month - 1 + months
    year = start.year + total // 12
    month = total % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)
```

Create `apps/api/src/family_api/services/installments.py`:

```python
"""Derived installment figures.

Nothing here is stored (FR-M2-18). `installments_paid` as a column would drift
the moment someone edits or deletes a payment, and the drift would be silent.
"""

from dataclasses import dataclass
from datetime import date

from family_api.dates import add_months


@dataclass(frozen=True)
class InstallmentFigures:
    total: int
    paid: int
    remaining: int
    next_on: date | None
    next_amount_minor: int | None
    is_overdue: bool


def compute_installments(
    installments_total: int | None,
    installment_amount_minor: int | None,
    first_installment_on: date | None,
    paid_total_minor: int,
    today: date,
) -> InstallmentFigures | None:
    """Return None for a debt with no plan — that is valid (FR-M2-19)."""
    if (
        installments_total is None
        or installment_amount_minor is None
        or first_installment_on is None
    ):
        return None

    # Floor: half a cuota is not a cuota.
    paid = min(paid_total_minor // installment_amount_minor, installments_total)
    remaining = installments_total - paid

    if remaining == 0:
        return InstallmentFigures(
            total=installments_total, paid=paid, remaining=0,
            next_on=None, next_amount_minor=None, is_overdue=False,
        )

    next_on = add_months(first_installment_on, paid)
    return InstallmentFigures(
        total=installments_total,
        paid=paid,
        remaining=remaining,
        next_on=next_on,
        next_amount_minor=installment_amount_minor,
        is_overdue=next_on < today,
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/unit/test_dates.py tests/unit/test_installments.py -v`
Expected: PASS — 14 tests

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/family_api/dates.py apps/api/src/family_api/services/installments.py apps/api/tests/unit
git commit -m "feat(debts): add derived installment figures"
```

---

### Task 2: Installment columns and the debt API

**Files:**
- Create: `apps/api/migrations/versions/0009_debt_installments.py`
- Modify: `apps/api/src/family_api/db/models/debt.py`, `schemas/debt.py`, `services/debts.py`, `routers/me_finance.py`
- Test: `apps/api/tests/integration/test_debt_installments.py`

**Interfaces:**
- Consumes: `compute_installments` (Task 1).
- Produces: `Debt.installments_total`, `.installment_amount_minor`, `.first_installment_on`; `DebtResponse` gaining six derived fields.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_debt_installments.py`:

```python
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
        f"/api/v1/me/debts/{debt_id}/payments/{payment.json()['id']}", headers=headers
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_debt_installments.py -v`
Expected: FAIL — the installment fields are rejected as unknown

- [ ] **Step 3: Add the model columns**

In `apps/api/src/family_api/db/models/debt.py`, add to the `Debt` class and its
`__table_args__`:

```python
    installments_total: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    installment_amount_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    first_installment_on: Mapped[date | None] = mapped_column(Date, nullable=True)
```

```python
        CheckConstraint(
            "installments_total IS NULL AND installment_amount_minor IS NULL "
            "AND first_installment_on IS NULL "
            "OR installments_total IS NOT NULL AND installment_amount_minor IS NOT NULL "
            "AND first_installment_on IS NOT NULL",
            name="ck_debt_installment_plan_complete",
        ),
        CheckConstraint(
            "installments_total IS NULL OR installments_total > 0",
            name="ck_debt_installments_positive",
        ),
        CheckConstraint(
            "installment_amount_minor IS NULL OR installment_amount_minor > 0",
            name="ck_debt_installment_amount_positive",
        ),
```

- [ ] **Step 4: Write the migration**

Create `apps/api/migrations/versions/0009_debt_installments.py`:

```python
"""Add optional installment plan columns to debts.

Revision ID: 0009_debt_installments
Revises: 0008_contributions
"""

import sqlalchemy as sa
from alembic import op

revision = "0009_debt_installments"
down_revision = "0008_contributions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("debts", sa.Column("installments_total", sa.SmallInteger(), nullable=True))
    op.add_column(
        "debts", sa.Column("installment_amount_minor", sa.BigInteger(), nullable=True)
    )
    op.add_column("debts", sa.Column("first_installment_on", sa.Date(), nullable=True))
    op.create_check_constraint(
        "ck_debt_installment_plan_complete",
        "debts",
        "installments_total IS NULL AND installment_amount_minor IS NULL "
        "AND first_installment_on IS NULL "
        "OR installments_total IS NOT NULL AND installment_amount_minor IS NOT NULL "
        "AND first_installment_on IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_debt_installments_positive", "debts",
        "installments_total IS NULL OR installments_total > 0",
    )
    op.create_check_constraint(
        "ck_debt_installment_amount_positive", "debts",
        "installment_amount_minor IS NULL OR installment_amount_minor > 0",
    )


def downgrade() -> None:
    op.drop_constraint("ck_debt_installment_amount_positive", "debts", type_="check")
    op.drop_constraint("ck_debt_installments_positive", "debts", type_="check")
    op.drop_constraint("ck_debt_installment_plan_complete", "debts", type_="check")
    op.drop_column("debts", "first_installment_on")
    op.drop_column("debts", "installment_amount_minor")
    op.drop_column("debts", "installments_total")
```

Apply: `DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`

- [ ] **Step 5: Extend the schemas**

In `apps/api/src/family_api/schemas/debt.py`, add to `CreateDebtRequest` (and the
same three optional fields to `UpdateDebtRequest` if it exists):

```python
    installments_total: int | None = Field(default=None, gt=0, le=360)
    installment_amount_minor: int | None = Field(default=None, gt=0)
    first_installment_on: date | None = None

    @model_validator(mode="after")
    def plan_is_all_or_nothing(self) -> "CreateDebtRequest":
        provided = [
            self.installments_total,
            self.installment_amount_minor,
            self.first_installment_on,
        ]
        if any(v is not None for v in provided) and not all(v is not None for v in provided):
            raise ValueError(
                "An installment plan needs installments_total, "
                "installment_amount_minor and first_installment_on together"
            )
        return self
```

Add `from pydantic import model_validator` and `from datetime import date` to the imports.

Extend `DebtResponse`:

```python
    installments_total: int | None = None
    installments_paid: int | None = None
    installments_remaining: int | None = None
    next_installment_on: date | None = None
    next_installment_amount_minor: int | None = None
    is_overdue: bool | None = None
```

- [ ] **Step 6: Extend the service**

In `apps/api/src/family_api/services/debts.py`, change
`list_debts_with_outstanding` to also return the paid total, and add a helper:

```python
from datetime import date as date_type

from family_api.services.installments import InstallmentFigures, compute_installments


async def list_debts_with_figures(
    session: AsyncSession, member_id: UUID, today: date_type | None = None
) -> list[tuple[Debt, int, InstallmentFigures | None]]:
    """Debt, outstanding, and derived installment figures."""
    today = today or date_type.today()
    rows = await list_debts_with_outstanding(session, member_id)
    result = []
    for debt, outstanding in rows:
        paid_total = debt.principal_minor - outstanding
        result.append(
            (
                debt,
                outstanding,
                compute_installments(
                    debt.installments_total,
                    debt.installment_amount_minor,
                    debt.first_installment_on,
                    paid_total,
                    today,
                ),
            )
        )
    return result
```

Also accept the three fields in `create_debt` and pass them to the `Debt(...)`
constructor.

- [ ] **Step 7: Update the router**

In `apps/api/src/family_api/routers/me_finance.py`, replace the debt response
construction with a helper used by all three debt routes:

```python
def _debt_response(debt, outstanding: int, figures, currency: str) -> DebtResponse:
    return DebtResponse(
        id=debt.id, creditor_type=debt.creditor_type, creditor_label=debt.creditor_label,
        principal_minor=debt.principal_minor, outstanding_minor=outstanding,
        annual_interest_rate=float(debt.annual_interest_rate)
        if debt.annual_interest_rate is not None else None,
        due_day=debt.due_day, status=debt.status, currency=currency,
        installments_total=figures.total if figures else None,
        installments_paid=figures.paid if figures else None,
        installments_remaining=figures.remaining if figures else None,
        next_installment_on=figures.next_on if figures else None,
        next_installment_amount_minor=figures.next_amount_minor if figures else None,
        is_overdue=figures.is_overdue if figures else None,
    )
```

and switch `list_debts`, `create_debt` and `add_debt_payment` to
`debt_service.list_debts_with_figures`.

Add the missing `DELETE /me/debts/{debt_id}/payments/{payment_id}` route if
Plan 2 did not build it — the test for schedule reversal needs it:

```python
@router.delete(
    "/debts/{debt_id}/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_debt_payment(
    debt_id: UUID, payment_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await debt_service.delete_payment(session, member, debt_id, payment_id)
    await session.commit()
```

with the matching service function, which reopens a `paid` debt when the
outstanding rises above zero again.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_debt_installments.py -v`
Expected: PASS — 8 tests

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/family_api apps/api/migrations apps/api/tests
git commit -m "feat(debts): add optional installment plans"
```

---

### Task 3: Household expense model and migration

**Files:**
- Create: `apps/api/src/family_api/db/models/household_expense.py`, `apps/api/migrations/versions/0010_household_expenses.py`
- Modify: `apps/api/src/family_api/db/models/__init__.py`, `db/models/contribution.py`, `db/models/transaction.py`
- Test: `apps/api/tests/integration/test_household_expense_model.py`

**Interfaces:**
- Consumes: `Base`, `TimestampMixin`, `Household`, `HouseholdMember`, `Category`, `Transaction`.
- Produces: `HouseholdExpense(id, household_id, category_id, amount_minor, occurred_on, note, funding, paid_by_member_id, expense_transaction_id)`; `Contribution.in_kind`; `transaction_source` gaining `household_expense`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/test_household_expense_model.py`:

```python
from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household_expense import HouseholdExpense
from family_api.ids import new_id


@pytest.mark.asyncio
async def test_pot_funded_rows_must_not_name_a_payer(
    db_session: AsyncSession, make_user
) -> None:
    """The CHECK is the backstop for FR-M4-10."""
    from family_api.services.households import create_household

    user = await make_user()
    household, _ = await create_household(db_session, user, "Hogar")
    category = (await db_session.scalars(__import__(
        "sqlalchemy").select(__import__(
        "family_api.db.models.seeded", fromlist=["Category"]).Category))).first()

    db_session.add(
        HouseholdExpense(
            id=new_id(), household_id=household.id, category_id=category.id,
            amount_minor=1_200_000, occurred_on=date(2026, 9, 3),
            funding="pot", paid_by_member_id=new_id(),
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_member_funded_rows_require_a_payer_and_a_transaction() -> None:
    table = HouseholdExpense.__table__
    names = {c.name for c in table.constraints if c.name}
    assert "ck_household_expense_funding" in names


@pytest.mark.asyncio
async def test_one_transaction_belongs_to_at_most_one_household_expense() -> None:
    assert HouseholdExpense.__table__.columns["expense_transaction_id"].unique is True


@pytest.mark.asyncio
async def test_contributions_carry_an_in_kind_flag() -> None:
    """FR-M4-12."""
    from family_api.db.models.contribution import Contribution

    column = Contribution.__table__.columns["in_kind"]
    assert column.nullable is False


@pytest.mark.asyncio
async def test_no_stored_pot_balance_column_exists() -> None:
    """FR-M4-13: derived, never stored."""
    from family_api.db.models.household import Household

    assert "pot_balance_minor" not in Household.__table__.columns
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pytest tests/integration/test_household_expense_model.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.db.models.household_expense'`

- [ ] **Step 3: Write the model**

Create `apps/api/src/family_api/db/models/household_expense.py`:

```python
from datetime import date
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import ENUM as PgEnum, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

expense_funding = PgEnum("pot", "member", name="expense_funding", create_type=False)


class HouseholdExpense(Base, TimestampMixin):
    """The household's own ledger.

    Distinct from `Transaction`, which is a row in ONE member's personal
    ledger. A member-funded household expense generates a transaction, but they
    are two rows in two tables with two different visibility rules
    (docs/visibility-rules.md §5.3).
    """

    __tablename__ = "household_expenses"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_household_expense_positive"),
        CheckConstraint(
            "funding = 'pot' AND paid_by_member_id IS NULL "
            "AND expense_transaction_id IS NULL "
            "OR funding = 'member' AND paid_by_member_id IS NOT NULL "
            "AND expense_transaction_id IS NOT NULL",
            name="ck_household_expense_funding",
        ),
        Index("ix_household_expense_ledger", "household_id", "occurred_on"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    funding: Mapped[str] = mapped_column(expense_funding, nullable=False)
    paid_by_member_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=True,
    )
    # The payer's mirrored personal expense (FR-M4-11). UNIQUE so no two
    # household expenses can claim the same transaction.
    expense_transaction_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="RESTRICT"),
        nullable=True,
        unique=True,
    )
```

Add `in_kind` to `Contribution` in `db/models/contribution.py`:

```python
    # True when a member paid a household expense directly (FR-M4-12). Counts
    # toward the period GOAL but never toward the POT BALANCE — that money went
    # pocket-to-expense and never arrived (FR-M4-13).
    in_kind: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
```

Register `HouseholdExpense` in `db/models/__init__.py`.

- [ ] **Step 4: Write the migration**

Create `apps/api/migrations/versions/0010_household_expenses.py`:

```python
"""Household ledger: expense_funding enum, household_expenses, contributions.in_kind.

Revision ID: 0010_household_expenses
Revises: 0009_debt_installments
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010_household_expenses"
down_revision = "0009_debt_installments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE expense_funding AS ENUM ('pot','member')")
    # Existing rows are all 'manual' or 'contribution'; adding a value is safe.
    op.execute("ALTER TYPE transaction_source ADD VALUE IF NOT EXISTS 'household_expense'")

    op.add_column(
        "contributions",
        sa.Column("in_kind", sa.Boolean(), nullable=False, server_default="false"),
    )

    op.create_table(
        "household_expenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("funding",
                  postgresql.ENUM(name="expense_funding", create_type=False),
                  nullable=False),
        sa.Column("paid_by_member_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("household_members.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("expense_transaction_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("transactions.id", ondelete="RESTRICT"),
                  nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount_minor > 0", name="ck_household_expense_positive"),
        sa.CheckConstraint(
            "funding = 'pot' AND paid_by_member_id IS NULL "
            "AND expense_transaction_id IS NULL "
            "OR funding = 'member' AND paid_by_member_id IS NOT NULL "
            "AND expense_transaction_id IS NOT NULL",
            name="ck_household_expense_funding",
        ),
    )
    op.create_index(
        "ix_household_expense_ledger", "household_expenses", ["household_id", "occurred_on"]
    )


def downgrade() -> None:
    op.drop_index("ix_household_expense_ledger", table_name="household_expenses")
    op.drop_table("household_expenses")
    op.drop_column("contributions", "in_kind")
    op.execute("DROP TYPE IF EXISTS expense_funding")
    # Postgres cannot remove a value from an enum. Leaving 'household_expense'
    # on transaction_source is harmless and is noted here so the asymmetry is
    # deliberate rather than an oversight.
```

**`ALTER TYPE ... ADD VALUE` cannot run inside a transaction block on older
Postgres.** On 16 it can, except when the value is used in the same
transaction. If the migration fails with that error, split it: run the
`ALTER TYPE` in its own revision before this one.

Apply: `DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_household_expense_model.py -v`
Expected: PASS — 5 tests

- [ ] **Step 6: Verify the migration reverses**

Run: `cd apps/api && DATABASE_URL=$TEST_DATABASE_URL alembic downgrade base && DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`
Expected: both succeed

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/family_api/db apps/api/migrations apps/api/tests
git commit -m "feat(db): add household expense ledger"
```

---

### Task 4: Pot balance

**Files:**
- Create: `apps/api/src/family_api/services/household_expenses.py`, `apps/api/src/family_api/schemas/household_expense.py`, `apps/api/src/family_api/routers/household_expenses.py`
- Modify: `apps/api/src/family_api/main.py`
- Test: `apps/api/tests/integration/test_pot_balance.py`

**Interfaces:**
- Consumes: `HouseholdExpense`, `Contribution`.
- Produces: `pot_figures(session, household_id) -> PotFigures` with `collected_minor`, `spent_minor`, `balance_minor`; `GET /household-expenses/pot`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/test_pot_balance.py`:

```python
import pytest
from httpx import AsyncClient


async def _setup(client: AsyncClient) -> tuple[dict, str, str]:
    """Returns (headers, period_id, expense_category_id)."""
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
    period = await client.post(
        "/api/v1/contribution-periods",
        json={"period_month": "2026-09-01", "goal_amount_minor": 2_000_000},
        headers=headers,
    )
    categories = await client.get("/api/v1/categories?kind=expense", headers=headers)
    category_id = next(c["id"] for c in categories.json() if c["name"] == "Otros")
    return headers, period.json()["id"], category_id


@pytest.mark.asyncio
async def test_an_empty_pot_is_zero(client: AsyncClient) -> None:
    headers, _, _ = await _setup(client)
    response = await client.get("/api/v1/household-expenses/pot", headers=headers)

    assert response.status_code == 200
    assert response.json() == {
        "collected_minor": 0, "spent_minor": 0, "balance_minor": 0, "currency": "COP",
    }


@pytest.mark.asyncio
async def test_a_contribution_fills_the_pot(client: AsyncClient) -> None:
    headers, period_id, _ = await _setup(client)
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=headers,
    )

    pot = await client.get("/api/v1/household-expenses/pot", headers=headers)

    assert pot.json()["collected_minor"] == 1_000_000
    assert pot.json()["balance_minor"] == 1_000_000


@pytest.mark.asyncio
async def test_a_pot_funded_expense_empties_it(client: AsyncClient) -> None:
    headers, period_id, category_id = await _setup(client)
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/contributions",
        json={"amount_minor": 1_000_000, "paid_on": "2026-09-05"},
        headers=headers,
    )
    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 400_000,
            "occurred_on": "2026-09-06", "funding": "pot",
        },
        headers=headers,
    )

    pot = await client.get("/api/v1/household-expenses/pot", headers=headers)

    assert pot.json()["spent_minor"] == 400_000
    assert pot.json()["balance_minor"] == 600_000


@pytest.mark.asyncio
async def test_no_stored_balance_column_exists() -> None:
    from family_api.db.models.household import Household

    assert "pot_balance_minor" not in Household.__table__.columns
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pytest tests/integration/test_pot_balance.py -v`
Expected: FAIL — 404 on `/api/v1/household-expenses/pot`

- [ ] **Step 3: Write the schemas**

Create `apps/api/src/family_api/schemas/household_expense.py`:

```python
from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CreateHouseholdExpenseRequest(BaseModel):
    category_id: UUID
    amount_minor: int = Field(gt=0)
    occurred_on: date
    note: str | None = None
    funding: Literal["pot", "member"]
    paid_by_member_id: UUID | None = None
    counts_as_contribution: bool = False

    @model_validator(mode="after")
    def funding_is_consistent(self) -> "CreateHouseholdExpenseRequest":
        if self.funding == "pot":
            if self.paid_by_member_id is not None:
                raise ValueError("A pot-funded expense has no payer")
            if self.counts_as_contribution:
                raise ValueError("Pot money is already a contribution")
        else:
            if self.paid_by_member_id is None:
                raise ValueError("A member-funded expense needs paid_by_member_id")
        return self


class UpdateHouseholdExpenseRequest(BaseModel):
    """Amount and funding are deliberately absent.

    Changing either would silently rewrite the pot balance and, for
    member-funded rows, someone's personal ledger. Delete and re-create.
    """

    category_id: UUID | None = None
    occurred_on: date | None = None
    note: str | None = None


class HouseholdExpenseResponse(BaseModel):
    id: UUID
    category_id: UUID
    category_name: str
    amount_minor: int
    currency: str
    occurred_on: date
    note: str | None
    funding: str
    paid_by_member_id: UUID | None
    paid_by_name: str | None
    expense_transaction_id: UUID | None
    contribution_id: UUID | None


class PotResponse(BaseModel):
    collected_minor: int
    spent_minor: int
    balance_minor: int
    currency: str
```

- [ ] **Step 4: Write the pot service**

Create `apps/api/src/family_api/services/household_expenses.py`:

```python
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.contribution import Contribution
from family_api.db.models.household_expense import HouseholdExpense


@dataclass(frozen=True)
class PotFigures:
    collected_minor: int
    spent_minor: int
    balance_minor: int


async def pot_figures(session: AsyncSession, household_id: UUID) -> PotFigures:
    """Derived, never stored (FR-M4-13).

    `collected` counts only NON-in-kind contributions: an in-kind contribution
    went straight from a member's pocket to an expense and never arrived in the
    pot. Counting it here would report cash the household does not have.
    """
    collected = await session.scalar(
        select(func.coalesce(func.sum(Contribution.amount_minor), 0)).where(
            Contribution.household_id == household_id,
            Contribution.in_kind.is_(False),
        )
    )
    spent = await session.scalar(
        select(func.coalesce(func.sum(HouseholdExpense.amount_minor), 0)).where(
            HouseholdExpense.household_id == household_id,
            HouseholdExpense.funding == "pot",
        )
    )
    collected, spent = int(collected or 0), int(spent or 0)
    return PotFigures(
        collected_minor=collected, spent_minor=spent, balance_minor=collected - spent
    )
```

- [ ] **Step 5: Write the router skeleton**

Create `apps/api/src/family_api/routers/household_expenses.py`:

```python
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household
from family_api.db.session import get_session
from family_api.schemas.household_expense import PotResponse
from family_api.services import household_expenses as ledger_service
from family_api.services.members import CurrentMember

router = APIRouter(prefix="/household-expenses", tags=["household-ledger"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _currency(session: AsyncSession, household_id: UUID) -> str:
    household = await session.get(Household, household_id)
    assert household is not None
    return household.currency


@router.get("/pot")
async def pot(member: CurrentMember, session: SessionDep) -> PotResponse:
    """Always visible to every household member (FR-M4-15)."""
    figures = await ledger_service.pot_figures(session, member.household_id)
    return PotResponse(
        collected_minor=figures.collected_minor,
        spent_minor=figures.spent_minor,
        balance_minor=figures.balance_minor,
        currency=await _currency(session, member.household_id),
    )
```

Mount in `main.py`: `app.include_router(household_expenses.router, prefix=API_PREFIX)`.

**The `/pot` route must be declared before any `/{expense_id}` route**, or
FastAPI matches `pot` as an id.

- [ ] **Step 6: Run the tests**

Two of the four will still fail — creating expenses is Task 5.

Run: `cd apps/api && pytest tests/integration/test_pot_balance.py -v -k "empty or contribution or stored"`
Expected: PASS — 3 tests

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/integration/test_pot_balance.py
git commit -m "feat(ledger): add derived pot balance"
```

---

### Task 5: Creating household expenses — the second atomic mirror

**The defining task of this plan.**

**Files:**
- Modify: `apps/api/src/family_api/services/household_expenses.py`, `routers/household_expenses.py`
- Test: `apps/api/tests/integration/test_household_expenses.py`

**Interfaces:**
- Consumes: `pot_figures` (Task 4), `get_open_period`, `Transaction`, `Contribution`.
- Produces: `create_expense(...) -> HouseholdExpense`; `list_expenses(...)`; `delete_expense(...)`; `InsufficientPotError`, `NoOpenPeriodError`, `ImmutableFieldError`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_household_expenses.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_household_expenses.py -v`
Expected: FAIL — 404 on `POST /api/v1/household-expenses`

- [ ] **Step 3: Write the errors and the service**

Append to `apps/api/src/family_api/services/household_expenses.py`:

```python
from datetime import date

from sqlalchemy import select as sa_select

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.seeded import Category
from family_api.db.models.transaction import Transaction
from family_api.errors import DomainError, ForbiddenRoleError, NotFoundError
from family_api.ids import new_id
from family_api.services.contributions import get_open_period


class InsufficientPotError(DomainError):
    type_slug = "insufficient_pot"
    status = 409
    title = "El pozo del hogar no alcanza"


class NoOpenPeriodError(DomainError):
    type_slug = "no_open_period"
    status = 409
    title = "No hay un periodo de aportes abierto"


async def create_expense(
    session: AsyncSession,
    member: HouseholdMember,
    category_id: UUID,
    amount_minor: int,
    occurred_on: date,
    note: str | None,
    funding: str,
    paid_by_member_id: UUID | None,
    counts_as_contribution: bool,
) -> HouseholdExpense:
    """Writes 1, 2 or 3 rows, always in ONE transaction.

      pot                          -> household_expense
      member                       -> household_expense + transaction
      member + counts_as_contribution
                                   -> household_expense + transaction + contribution,
                                      where the contribution points at the SAME
                                      transaction, so the money leaves the
                                      member's ledger exactly once (FR-M4-12).
    """
    if member.role == "guest":
        raise ForbiddenRoleError

    category = await session.scalar(
        sa_select(Category).where(
            Category.id == category_id,
            Category.household_id == member.household_id,
            Category.kind == "expense",
        )
    )
    if category is None:
        raise NotFoundError

    expense_id = new_id()
    transaction_id: UUID | None = None

    if funding == "pot":
        # Lock the household so two concurrent spends cannot both pass the
        # check and overdraw the pot together (INV-D-09).
        await session.execute(
            sa_select(Household.id)
            .where(Household.id == member.household_id)
            .with_for_update()
        )
        figures = await pot_figures(session, member.household_id)
        if amount_minor > figures.balance_minor:
            raise InsufficientPotError
    else:
        # You may only record what you yourself paid, unless you are an admin.
        if paid_by_member_id != member.id and member.role != "admin":
            raise ForbiddenRoleError

        payer = await session.get(HouseholdMember, paid_by_member_id)
        if payer is None or payer.household_id != member.household_id:
            raise NotFoundError

        transaction = Transaction(
            id=new_id(), household_id=member.household_id, member_id=payer.id,
            kind="expense", category_id=category.id, amount_minor=amount_minor,
            occurred_on=occurred_on, note=note,
            source="household_expense", source_id=expense_id,
        )
        session.add(transaction)
        await session.flush()
        transaction_id = transaction.id

        if counts_as_contribution:
            period = await get_open_period(session, member.household_id)
            if period is None:
                raise NoOpenPeriodError
            from family_api.db.models.contribution import Contribution

            session.add(
                Contribution(
                    id=new_id(), household_id=member.household_id,
                    period_id=period.id, member_id=payer.id,
                    amount_minor=amount_minor, paid_on=occurred_on, note=note,
                    expense_transaction_id=transaction.id,
                    # Counts toward the GOAL, never toward the POT (FR-M4-13).
                    in_kind=True,
                )
            )

    expense = HouseholdExpense(
        id=expense_id, household_id=member.household_id, category_id=category.id,
        amount_minor=amount_minor, occurred_on=occurred_on, note=note,
        funding=funding, paid_by_member_id=paid_by_member_id,
        expense_transaction_id=transaction_id,
    )
    session.add(expense)
    await session.flush()
    return expense


async def list_expenses(
    session: AsyncSession,
    household_id: UUID,
    start: date,
    end: date,
    funding: str | None = None,
) -> list[tuple[HouseholdExpense, str, str | None, UUID | None]]:
    """Returns (expense, category_name, payer_name, contribution_id)."""
    from family_api.db.models.contribution import Contribution
    from family_api.db.models.user import User

    stmt = (
        sa_select(
            HouseholdExpense, Category.name, User.display_name, Contribution.id,
        )
        .join(Category, Category.id == HouseholdExpense.category_id)
        .outerjoin(
            HouseholdMember, HouseholdMember.id == HouseholdExpense.paid_by_member_id
        )
        .outerjoin(User, User.id == HouseholdMember.user_id)
        .outerjoin(
            Contribution,
            Contribution.expense_transaction_id == HouseholdExpense.expense_transaction_id,
        )
        .where(
            HouseholdExpense.household_id == household_id,
            HouseholdExpense.occurred_on >= start,
            HouseholdExpense.occurred_on <= end,
        )
    )
    if funding is not None:
        stmt = stmt.where(HouseholdExpense.funding == funding)
    stmt = stmt.order_by(HouseholdExpense.occurred_on.desc())
    return [tuple(row) for row in (await session.execute(stmt)).all()]


async def delete_expense(
    session: AsyncSession, member: HouseholdMember, expense_id: UUID
) -> None:
    """Removes the expense, its mirrored transaction and any in-kind
    contribution, atomically and in FK-safe order."""
    from family_api.db.models.contribution import Contribution

    expense = await session.scalar(
        sa_select(HouseholdExpense).where(
            HouseholdExpense.id == expense_id,
            HouseholdExpense.household_id == member.household_id,
        )
    )
    if expense is None:
        raise NotFoundError
    if (
        expense.paid_by_member_id is not None
        and expense.paid_by_member_id != member.id
        and member.role != "admin"
    ):
        raise ForbiddenRoleError

    transaction_id = expense.expense_transaction_id
    await session.delete(expense)
    await session.flush()

    if transaction_id is not None:
        contribution = await session.scalar(
            sa_select(Contribution).where(
                Contribution.expense_transaction_id == transaction_id
            )
        )
        if contribution is not None:
            await session.delete(contribution)
            await session.flush()

        transaction = await session.get(Transaction, transaction_id)
        if transaction is not None:
            await session.delete(transaction)
    await session.flush()
```

- [ ] **Step 4: Add the routes**

Append to `apps/api/src/family_api/routers/household_expenses.py`:

```python
from fastapi import status

from family_api.periods import parse_period
from family_api.schemas.household_expense import (
    CreateHouseholdExpenseRequest, HouseholdExpenseResponse,
    UpdateHouseholdExpenseRequest,
)


async def _timezone(session: AsyncSession, household_id: UUID) -> str:
    household = await session.get(Household, household_id)
    assert household is not None
    return household.timezone


@router.get("")
async def list_expenses(
    member: CurrentMember,
    session: SessionDep,
    period: str | None = None,
    funding: str | None = None,
) -> list[HouseholdExpenseResponse]:
    """Always visible to every household member (FR-M4-15). No resolution."""
    start, end = parse_period(period, await _timezone(session, member.household_id))
    currency = await _currency(session, member.household_id)
    rows = await ledger_service.list_expenses(
        session, member.household_id, start, end, funding
    )
    return [
        HouseholdExpenseResponse(
            id=e.id, category_id=e.category_id, category_name=category_name,
            amount_minor=e.amount_minor, currency=currency, occurred_on=e.occurred_on,
            note=e.note, funding=e.funding, paid_by_member_id=e.paid_by_member_id,
            paid_by_name=payer_name, expense_transaction_id=e.expense_transaction_id,
            contribution_id=contribution_id,
        )
        for e, category_name, payer_name, contribution_id in rows
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_expense(
    body: CreateHouseholdExpenseRequest, member: CurrentMember, session: SessionDep
) -> HouseholdExpenseResponse:
    expense = await ledger_service.create_expense(
        session, member, body.category_id, body.amount_minor, body.occurred_on,
        body.note, body.funding, body.paid_by_member_id, body.counts_as_contribution,
    )
    await session.commit()
    rows = await ledger_service.list_expenses(
        session, member.household_id, expense.occurred_on, expense.occurred_on
    )
    e, category_name, payer_name, contribution_id = next(
        row for row in rows if row[0].id == expense.id
    )
    return HouseholdExpenseResponse(
        id=e.id, category_id=e.category_id, category_name=category_name,
        amount_minor=e.amount_minor,
        currency=await _currency(session, member.household_id),
        occurred_on=e.occurred_on, note=e.note, funding=e.funding,
        paid_by_member_id=e.paid_by_member_id, paid_by_name=payer_name,
        expense_transaction_id=e.expense_transaction_id,
        contribution_id=contribution_id,
    )


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await ledger_service.delete_expense(session, member, expense_id)
    await session.commit()
```

Also add a `PATCH /{expense_id}` accepting only `UpdateHouseholdExpenseRequest`
— its schema has no `amount_minor` or `funding`, so Pydantic silently drops
them, which is exactly the behaviour the immutability test asserts.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_household_expenses.py tests/integration/test_pot_balance.py -v`
Expected: PASS — 11 tests

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/family_api apps/api/tests
git commit -m "feat(ledger): add household expenses with mirror"
```

---

### Task 6: In-kind contributions

**Files:**
- Test: `apps/api/tests/integration/test_in_kind.py`

**Interfaces:**
- Consumes: `create_expense` (Task 5), `period_totals` (Plan 3).
- Produces: nothing. This task pins the goal-versus-pot distinction that a future "simplification" would collapse.

- [ ] **Step 1: Write the test**

Create `apps/api/tests/integration/test_in_kind.py`:

```python
"""An in-kind contribution counts toward the GOAL but never toward the POT.

FR-M4-13. That money went pocket-to-expense and never arrived. Counting it into
the pot balance would report cash the household does not have — and the family
would then try to spend it.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.transaction import Transaction


async def _setup(client: AsyncClient) -> tuple[dict, dict, str, str, str]:
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
    registered_mama = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "mama@example.com",
            "password": "correct-horse-battery",
            "display_name": "Mamá",
        },
    )
    mama = {"Authorization": f"Bearer {registered_mama.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=mama
    )
    period = await client.post(
        "/api/v1/contribution-periods",
        json={"period_month": "2026-09-01", "goal_amount_minor": 2_000_000},
        headers=daniel,
    )
    categories = await client.get("/api/v1/categories?kind=expense", headers=daniel)
    category_id = next(c["id"] for c in categories.json() if c["name"] == "Comida")
    members = await client.get("/api/v1/households/current", headers=daniel)
    mama_id = next(
        m["id"] for m in members.json()["members"] if m["display_name"] == "Mamá"
    )
    return daniel, mama, period.json()["id"], category_id, mama_id


@pytest.mark.asyncio
async def test_in_kind_counts_toward_the_goal(client: AsyncClient) -> None:
    daniel, mama, _, category_id, mama_id = await _setup(client)

    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 600_000,
            "occurred_on": "2026-09-07", "note": "Mercado del mes",
            "funding": "member", "paid_by_member_id": mama_id,
            "counts_as_contribution": True,
        },
        headers=mama,
    )

    current = await client.get("/api/v1/contribution-periods/current", headers=daniel)
    assert current.json()["collected_minor"] == 600_000
    row = next(
        m for m in current.json()["members"] if m["member_id"] == mama_id
    )
    assert row["contributed_minor"] == 600_000


@pytest.mark.asyncio
async def test_in_kind_never_enters_the_pot(client: AsyncClient) -> None:
    """L-14. The crux of FR-M4-13."""
    daniel, mama, _, category_id, mama_id = await _setup(client)

    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 600_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": mama_id, "counts_as_contribution": True,
        },
        headers=mama,
    )

    pot = await client.get("/api/v1/household-expenses/pot", headers=daniel)

    assert pot.json()["collected_minor"] == 0
    assert pot.json()["spent_minor"] == 0
    assert pot.json()["balance_minor"] == 0


@pytest.mark.asyncio
async def test_the_money_leaves_the_members_ledger_exactly_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """L-13 / INV-D-08: one transaction, referenced from two places."""
    _, mama, _, category_id, mama_id = await _setup(client)

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 600_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": mama_id, "counts_as_contribution": True,
        },
        headers=mama,
    )

    body = response.json()
    assert body["expense_transaction_id"] is not None
    assert body["contribution_id"] is not None

    mirrored = (
        await db_session.scalars(
            select(Transaction).where(Transaction.member_id == mama_id)
        )
    ).all()
    assert len(mirrored) == 1
    assert mirrored[0].amount_minor == 600_000

    ledger = await client.get(
        "/api/v1/me/transactions?kind=expense&period=2026-09", headers=mama
    )
    assert len(ledger.json()["items"]) == 1


@pytest.mark.asyncio
async def test_in_kind_requires_an_open_period(client: AsyncClient) -> None:
    daniel, mama, period_id, category_id, mama_id = await _setup(client)
    await client.post(f"/api/v1/contribution-periods/{period_id}/close", headers=daniel)

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 600_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": mama_id, "counts_as_contribution": True,
        },
        headers=mama,
    )

    assert response.status_code == 409
    assert response.json()["type"] == "no_open_period"


@pytest.mark.asyncio
async def test_pot_funded_expenses_cannot_be_in_kind(client: AsyncClient) -> None:
    """Pot money is already a contribution; counting it again double-counts."""
    daniel, _, _, category_id, _ = await _setup(client)

    response = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 100_000,
            "occurred_on": "2026-09-07", "funding": "pot",
            "counts_as_contribution": True,
        },
        headers=daniel,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_deleting_an_in_kind_expense_removes_all_three_rows(
    client: AsyncClient,
) -> None:
    daniel, mama, _, category_id, mama_id = await _setup(client)
    created = await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 600_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": mama_id, "counts_as_contribution": True,
        },
        headers=mama,
    )

    await client.delete(
        f"/api/v1/household-expenses/{created.json()['id']}", headers=mama
    )

    current = await client.get("/api/v1/contribution-periods/current", headers=daniel)
    assert current.json()["collected_minor"] == 0

    ledger = await client.get(
        "/api/v1/me/transactions?kind=expense&period=2026-09", headers=mama
    )
    assert ledger.json()["items"] == []
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/api && pytest tests/integration/test_in_kind.py -v`
Expected: PASS — 6 tests

If `test_in_kind_never_enters_the_pot` fails, the bug is in `pot_figures`
filtering on `Contribution.in_kind`. Fix the query, never the assertion.

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/integration/test_in_kind.py
git commit -m "test(ledger): pin in-kind goal vs pot rule"
```

---

### Task 7: Household ledger visibility

**Files:**
- Modify: `apps/api/tests/visibility/test_route_coverage.py`
- Test: `apps/api/tests/visibility/test_household_ledger_visibility.py`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing. Third instance of the "same fact, two surfaces" shape.

- [ ] **Step 1: Add the route exemption**

In `apps/api/tests/visibility/test_route_coverage.py`, add to `EXEMPT_PREFIXES`:

```python
    "/api/v1/household-expenses",  # FR-M4-15: shared money, always household-visible
```

- [ ] **Step 2: Write the test**

Create `apps/api/tests/visibility/test_household_ledger_visibility.py`:

```python
"""Same fact, two surfaces, two rules — for the third time.

FR-M4-15: the household ledger is always visible to the household.
FR-M4-16: the mirrored personal expense is a NORMAL transaction and resolves
against the payer's `expenses` setting.

An implementer who "simplifies" either direction breaks the model.
"""

import pytest
from httpx import AsyncClient

MODULES = ["income", "expenses", "savings", "debts"]


async def _setup(client: AsyncClient) -> tuple[dict, dict, str, str]:
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
    registered_mama = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "mama@example.com",
            "password": "correct-horse-battery",
            "display_name": "Mamá",
        },
    )
    mama = {"Authorization": f"Bearer {registered_mama.json()['access_token']}"}
    await client.post(
        "/api/v1/households/join", json={"code": invite.json()["code"]}, headers=mama
    )
    categories = await client.get("/api/v1/categories?kind=expense", headers=daniel)
    category_id = next(c["id"] for c in categories.json() if c["name"] == "Comida")
    members = await client.get("/api/v1/households/current", headers=daniel)
    mama_id = next(
        m["id"] for m in members.json()["members"] if m["display_name"] == "Mamá"
    )
    return daniel, mama, category_id, mama_id


@pytest.mark.asyncio
async def test_the_household_ledger_is_visible_while_the_payers_ledger_is_not(
    client: AsyncClient,
) -> None:
    daniel, mama, category_id, mama_id = await _setup(client)
    await client.put(
        "/api/v1/me/visibility", json={m: "private" for m in MODULES}, headers=mama
    )
    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 250_000,
            "occurred_on": "2026-09-07", "note": "Luz",
            "funding": "member", "paid_by_member_id": mama_id,
        },
        headers=mama,
    )

    # Surface 1: the household ledger. Always visible, including who paid.
    ledger = await client.get("/api/v1/household-expenses", headers=daniel)
    assert ledger.status_code == 200
    assert ledger.json()[0]["amount_minor"] == 250_000
    assert ledger.json()[0]["paid_by_name"] == "Mamá"

    # Surface 2: Mamá's personal expense ledger. As private as she set it.
    personal = await client.get(
        f"/api/v1/members/{mama_id}/expenses?period=2026-09", headers=daniel
    )
    assert personal.status_code == 403
    assert personal.json()["type"] == "not_visible"


@pytest.mark.asyncio
async def test_the_mirrored_expense_counts_in_a_summary_total(
    client: AsyncClient,
) -> None:
    """FR-M3-05: a summary is the member's TRUE total."""
    daniel, mama, category_id, mama_id = await _setup(client)
    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 250_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": mama_id,
        },
        headers=mama,
    )

    personal = await client.get(
        f"/api/v1/members/{mama_id}/expenses?period=2026-09", headers=daniel
    )

    assert personal.status_code == 200
    assert personal.json()["total_minor"] == 250_000


@pytest.mark.asyncio
async def test_a_guest_sees_the_household_ledger(client: AsyncClient) -> None:
    """A guest observes household aggregates; the ledger is one."""
    daniel, mama, category_id, mama_id = await _setup(client)
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
    await client.post(
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 250_000,
            "occurred_on": "2026-09-07", "funding": "member",
            "paid_by_member_id": mama_id,
        },
        headers=mama,
    )

    assert (
        await client.get("/api/v1/household-expenses", headers=guest)
    ).status_code == 200
    assert (
        await client.get("/api/v1/household-expenses/pot", headers=guest)
    ).status_code == 200


@pytest.mark.asyncio
async def test_a_guest_cannot_record_a_household_expense(client: AsyncClient) -> None:
    daniel, _, category_id, _ = await _setup(client)
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "guest"},
        headers=daniel,
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
        "/api/v1/household-expenses",
        json={
            "category_id": category_id, "amount_minor": 100_000,
            "occurred_on": "2026-09-07", "funding": "pot",
        },
        headers=guest,
    )

    assert response.status_code == 403
```

- [ ] **Step 3: Run the tests and the whole visibility suite**

Run: `cd apps/api && pytest tests/visibility -v`
Expected: PASS — including the matrix and route coverage

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/visibility
git commit -m "test(ledger): cover household ledger visibility"
```

---

### Task 8: Dashboard, seed, and full verification

**Files:**
- Modify: `apps/api/src/family_api/services/dashboard.py`, `schemas/dashboard.py`, `scripts/seed.py`
- Test: `apps/api/tests/integration/test_dashboard.py`, `test_seed.py`

**Interfaces:**
- Consumes: `pot_figures`.
- Produces: `DashboardResponse.pot`; a seed that spends part of the pot.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/tests/integration/test_dashboard.py`:

```python
@pytest.mark.asyncio
async def test_the_dashboard_reports_the_pot(client: AsyncClient) -> None:
    admin, _, _ = await _household(client)
    await client.post(
        "/api/v1/contribution-periods",
        json={"period_month": "2026-09-01", "goal_amount_minor": 2_000_000},
        headers=admin,
    )

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)

    assert response.status_code == 200
    assert "pot" in response.json()
    assert response.json()["pot"]["balance_minor"] == 0
```

Append to `apps/api/tests/integration/test_seed.py`:

```python
@pytest.mark.asyncio
async def test_the_seed_spends_part_of_the_pot(db_session: AsyncSession) -> None:
    """The demo household must exercise both funding paths on first run."""
    from family_api.db.models.household_expense import HouseholdExpense

    await seed_demo_household(db_session)

    expenses = (await db_session.scalars(select(HouseholdExpense))).all()
    fundings = {e.funding for e in expenses}

    assert "pot" in fundings
    assert "member" in fundings
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_dashboard.py tests/integration/test_seed.py -v`
Expected: FAIL — no `pot` key; no household expenses

- [ ] **Step 3: Add the pot to the dashboard**

In `apps/api/src/family_api/schemas/dashboard.py`:

```python
class PotSummary(BaseModel):
    collected_minor: int
    spent_minor: int
    balance_minor: int
```

and add `pot: PotSummary` to `DashboardResponse`.

In `apps/api/src/family_api/services/dashboard.py`, import `pot_figures` and
build it before the return:

```python
    from family_api.services.household_expenses import pot_figures

    figures = await pot_figures(session, household.id)
```

```python
        pot=PotSummary(
            collected_minor=figures.collected_minor,
            spent_minor=figures.spent_minor,
            balance_minor=figures.balance_minor,
        ),
```

**`exclude_none=True` is still applied by the router**, so make sure every
`PotSummary` field is a real integer and never `None`, or it will vanish from
the payload.

- [ ] **Step 4: Extend the seed**

In `apps/api/scripts/seed.py`, after the contributions block, add:

```python
    from family_api.services.household_expenses import create_expense

    otros = await session.scalar(
        select(Category).where(
            Category.household_id == household.id,
            Category.kind == "expense",
            Category.name == "Otros",
        )
    )
    comida = await session.scalar(
        select(Category).where(
            Category.household_id == household.id,
            Category.kind == "expense",
            Category.name == "Comida",
        )
    )

    # Pot-funded: rent, paid from the collected money.
    await create_expense(
        session, admin_member, otros.id, 1_200_000, date.today(),
        "Arriendo", "pot", None, False,
    )

    # Member-funded and in kind: Mamá paid the groceries herself, and it counts
    # as her contribution. Exercises all three rows in one go.
    mama_member = await session.scalar(
        select(HouseholdMember)
        .join(User, User.id == HouseholdMember.user_id)
        .where(
            HouseholdMember.household_id == household.id,
            User.display_name == "Mamá",
        )
    )
    await create_expense(
        session, mama_member, comida.id, 250_000, date.today(),
        "Mercado de la semana", "member", mama_member.id, False,
    )
```

Add `from family_api.db.models.seeded import Category` to the imports.

The pot-funded rent of `$1.200.000` fits inside the `$1.900.000` collected, so
FR-M4-14 is satisfied. If you change the seeded contribution figures, check
this still holds or the seed will start failing with `insufficient_pot`.

- [ ] **Step 5: Run the full suite and the linters**

Run: `cd apps/api && pytest -v && ruff check . && mypy src`
Expected: all PASS. **Paste real output — do not summarize from memory.**

- [ ] **Step 6: Verify migrations reverse from empty**

Run:
```bash
cd apps/api && DATABASE_URL=$TEST_DATABASE_URL alembic downgrade base \
  && DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head
```

Note the known asymmetry: `downgrade` cannot remove `household_expense` from
the `transaction_source` enum, because Postgres does not support removing enum
values. That is documented in migration `0010` and is harmless.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/family_api apps/api/scripts apps/api/tests
git commit -m "feat(dashboard): add pot balance to dashboard"
```

---

### Task 9: Web — household ledger screen

**Files:**
- Create: `apps/web/src/app/(app)/hogar/gastos/page.tsx`, `src/components/finance/{PotBalanceCard,HouseholdExpenseRow}.tsx`
- Test: `apps/web/src/components/__tests__/HouseholdExpenseRow.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `clientFetch`, `MoneyDisplay`, `MoneyInput`, `Sheet`, `Card`, `EmptyState` (Plan 4).
- Produces: `<PotBalanceCard>`, `<HouseholdExpenseRow>`, the `/hogar/gastos` route.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/__tests__/HouseholdExpenseRow.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  HouseholdExpenseRow,
  type HouseholdExpense,
} from "../finance/HouseholdExpenseRow";

const potExpense: HouseholdExpense = {
  id: "1",
  category_id: "c1",
  category_name: "Otros",
  amount_minor: 1_200_000,
  currency: "COP",
  occurred_on: "2026-09-03",
  note: "Arriendo septiembre",
  funding: "pot",
  paid_by_member_id: null,
  paid_by_name: null,
  expense_transaction_id: null,
  contribution_id: null,
};

const memberExpense: HouseholdExpense = {
  ...potExpense,
  id: "2",
  category_name: "Comida",
  amount_minor: 250_000,
  note: "Mercado",
  funding: "member",
  paid_by_member_id: "m1",
  paid_by_name: "Mamá",
  expense_transaction_id: "t1",
  contribution_id: null,
};

describe("HouseholdExpenseRow", () => {
  it("shows a pot-funded expense as paid from the pot", () => {
    render(<HouseholdExpenseRow expense={potExpense} />);
    expect(screen.getByText("Del pozo")).toBeInTheDocument();
    expect(screen.getByText("$1.200.000")).toBeInTheDocument();
  });

  it("names who paid a member-funded expense", () => {
    // Who paid is household information, not personal information (§5.3).
    render(<HouseholdExpenseRow expense={memberExpense} />);
    expect(screen.getByText("Pagó Mamá")).toBeInTheDocument();
  });

  it("marks an in-kind expense as counting toward the contribution", () => {
    render(
      <HouseholdExpenseRow expense={{ ...memberExpense, contribution_id: "c9" }} />,
    );
    expect(screen.getByText("Cuenta como aporte")).toBeInTheDocument();
  });

  it("never renders a PrivateBlock", () => {
    // The household ledger has no visibility rules at all (FR-M4-15).
    const { container } = render(<HouseholdExpenseRow expense={memberExpense} />);
    expect(container.textContent).not.toContain("Privado");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/__tests__/HouseholdExpenseRow.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the components**

Create `apps/web/src/components/finance/HouseholdExpenseRow.tsx`:

```tsx
import { MoneyDisplay } from "./MoneyDisplay";

export interface HouseholdExpense {
  id: string;
  category_id: string;
  category_name: string;
  amount_minor: number;
  currency: string;
  occurred_on: string;
  note: string | null;
  funding: "pot" | "member";
  paid_by_member_id: string | null;
  paid_by_name: string | null;
  expense_transaction_id: string | null;
  contribution_id: string | null;
}

export function HouseholdExpenseRow({ expense }: { expense: HouseholdExpense }) {
  return (
    <li className="flex items-center justify-between border-b border-border py-3">
      <div className="flex flex-col">
        <span className="font-medium">{expense.category_name}</span>
        {expense.note ? (
          <span className="text-sm text-text-muted">{expense.note}</span>
        ) : null}
        <span className="text-xs text-text-muted">{expense.occurred_on}</span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <MoneyDisplay
          amountMinor={expense.amount_minor}
          currency={expense.currency}
          className="text-lg font-semibold"
        />
        <span className="text-xs text-text-muted">
          {expense.funding === "pot" ? "Del pozo" : `Pagó ${expense.paid_by_name}`}
        </span>
        {expense.contribution_id ? (
          <span className="text-xs text-brand">Cuenta como aporte</span>
        ) : null}
      </div>
    </li>
  );
}
```

Create `apps/web/src/components/finance/PotBalanceCard.tsx`:

```tsx
import { Card } from "@/components/ui/Card";
import { MoneyDisplay } from "./MoneyDisplay";

export function PotBalanceCard({
  collectedMinor,
  spentMinor,
  balanceMinor,
  currency,
}: {
  collectedMinor: number;
  spentMinor: number;
  balanceMinor: number;
  currency: string;
}) {
  return (
    <Card className="flex flex-col gap-2">
      <span className="text-sm text-text-muted">Pozo del hogar</span>
      <MoneyDisplay
        amountMinor={balanceMinor}
        currency={currency}
        className="text-3xl font-bold"
      />
      <div className="flex justify-between text-xs text-text-muted">
        <span>
          Recaudado <MoneyDisplay amountMinor={collectedMinor} currency={currency} />
        </span>
        <span>
          Gastado <MoneyDisplay amountMinor={spentMinor} currency={currency} />
        </span>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Write the page**

Create `apps/web/src/app/(app)/hogar/gastos/page.tsx` — a Server Component
fetching `/household-expenses/pot` and `/household-expenses`, rendering
`PotBalanceCard` then a list of `HouseholdExpenseRow`, with an `EmptyState`
reading "Aún no hay gastos del hogar".

Below it, a client `Sheet` posting to `/household-expenses` with: `MoneyInput`,
a category selector, a date, a note, a **funding toggle** ("Del pozo" /
"Lo pagué yo"), and — visible only when "Lo pagué yo" is selected — a checkbox
"Que cuente como mi aporte del mes".

Two error states to handle by `type`, not by message:
- `insufficient_pot` → "El pozo no alcanza. Saldo disponible: $X."
- `no_open_period` → "No hay un periodo de aportes abierto este mes."

Add a link to `/hogar/gastos` from the `/hogar` page.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS — 4 new tests

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add household ledger screen"
```

---

### Task 10: Web — installments on the debt card

**Files:**
- Create: `apps/web/src/components/finance/InstallmentSummary.tsx`
- Modify: `apps/web/src/components/finance/DebtCard.tsx`
- Test: `apps/web/src/components/__tests__/InstallmentSummary.test.tsx`

**Interfaces:**
- Consumes: `MoneyDisplay`.
- Produces: `<InstallmentSummary debt />`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/__tests__/InstallmentSummary.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InstallmentSummary } from "../finance/InstallmentSummary";

const plan = {
  installments_total: 12,
  installments_paid: 2,
  installments_remaining: 10,
  next_installment_on: "2026-12-15",
  next_installment_amount_minor: 100_000,
  is_overdue: false,
  currency: "COP",
};

describe("InstallmentSummary", () => {
  it("shows progress through the plan", () => {
    render(<InstallmentSummary {...plan} />);
    expect(screen.getByText("Cuota 2 de 12")).toBeInTheDocument();
  });

  it("shows the next installment and its date", () => {
    render(<InstallmentSummary {...plan} />);
    expect(screen.getByText(/Próxima: \$100\.000/)).toBeInTheDocument();
    expect(screen.getByText(/2026-12-15/)).toBeInTheDocument();
  });

  it("flags an overdue installment", () => {
    render(<InstallmentSummary {...plan} is_overdue={true} />);
    expect(screen.getByText("En mora")).toBeInTheDocument();
  });

  it("renders nothing when there is no plan", () => {
    const { container } = render(
      <InstallmentSummary
        installments_total={null}
        installments_paid={null}
        installments_remaining={null}
        next_installment_on={null}
        next_installment_amount_minor={null}
        is_overdue={null}
        currency="COP"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("says the plan is finished when nothing remains", () => {
    render(
      <InstallmentSummary
        {...plan}
        installments_paid={12}
        installments_remaining={0}
        next_installment_on={null}
        next_installment_amount_minor={null}
      />,
    );
    expect(screen.getByText("Plan completado")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/__tests__/InstallmentSummary.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

Create `apps/web/src/components/finance/InstallmentSummary.tsx`:

```tsx
import { MoneyDisplay } from "./MoneyDisplay";

interface Props {
  installments_total: number | null;
  installments_paid: number | null;
  installments_remaining: number | null;
  next_installment_on: string | null;
  next_installment_amount_minor: number | null;
  is_overdue: boolean | null;
  currency: string;
}

export function InstallmentSummary(props: Props) {
  // A debt without a plan is valid and renders nothing (FR-M2-19).
  if (props.installments_total === null) return null;

  const percent = Math.round(
    ((props.installments_paid ?? 0) / props.installments_total) * 100,
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">
          Cuota {props.installments_paid} de {props.installments_total}
        </span>
        {props.is_overdue ? (
          <span className="font-medium text-danger">En mora</span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Cuotas pagadas"
        className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className="h-full bg-debt" style={{ width: `${percent}%` }} />
      </div>
      {props.installments_remaining === 0 ? (
        <span className="text-xs text-success">Plan completado</span>
      ) : (
        <span className="text-xs text-text-muted">
          Próxima:{" "}
          <MoneyDisplay
            amountMinor={props.next_installment_amount_minor ?? 0}
            currency={props.currency}
          />{" "}
          · {props.next_installment_on}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire it into `DebtCard`**

Change `DebtCard` to a column layout and render `<InstallmentSummary {...debt} />`
beneath the existing row. Extend the `Debt` interface in that file with the six
installment fields, all nullable.

Also extend the debt-creation Sheet from Plan 4 Task 8 with an optional
"Plan de cuotas" section: number of installments, installment amount, and first
installment date. All three or none — mirror the API rule client-side so the
user gets an inline message instead of a 422.

- [ ] **Step 5: Run the full verification**

```bash
cd apps/api && pytest -v && ruff check . && mypy src
cd ../web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build
make api-types && git diff --exit-code apps/web/src/lib/api/generated
```

Expected: everything PASS, no client diff.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): show debt installment plans"
```

---

## Plan Self-Review

**1. Spec coverage.**

| Requirement | Task |
| ----------- | ---- |
| FR-M2-17 optional installment plan, all three fields or none | 2 |
| FR-M2-18 all installment figures derived | 1, 2 |
| FR-M2-19 a debt without a plan is valid | 1, 2, 10 |
| FR-M4-09 household has its own expense ledger | 3, 5 |
| FR-M4-10 funding is `pot` or `member` | 3 (CHECK), 5 |
| FR-M4-11 member-funded always mirrors atomically | 5 |
| FR-M4-12 in-kind creates a contribution on the same transaction | 5, 6 |
| FR-M4-13 pot balance derived; in-kind never enters it | 4, 6 |
| FR-M4-14 pot cannot be overdrawn, under a row lock | 5 |
| FR-M4-15 household ledger always household-visible | 7 |
| FR-M4-16 mirrored expense governed by the payer's setting | 7 |
| INV-D-07 · INV-D-08 · INV-D-09 | 5 · 6 · 5 |
| L-12 … L-17 | 5, 6, 2 |

**2. Placeholder scan.** One prose-specified screen (Task 9 Step 4, the ledger
page) and two prose-specified form extensions (Task 9's sheet, Task 10 Step 4's
installment fields). Same deliberate trade-off as Plan 4: each names its exact
endpoint, components, Spanish copy, error `type` slugs and empty state, and
composes primitives whose full code exists in Plan 4.

**3. Type consistency.** `add_months` (1 → 1), `compute_installments` /
`InstallmentFigures` (1 → 2), `list_debts_with_figures` (2 → 2), `pot_figures` /
`PotFigures` (4 → 5, 8), `create_expense` (5 → 6, 8), `list_expenses` returning
a 4-tuple (5 → 5), `delete_expense` (5 → 6), `InsufficientPotError` /
`NoOpenPeriodError` (5 → 5), `HouseholdExpense` TS interface (9 → 9),
`InstallmentSummary` props matching `DebtResponse` field names exactly (2 → 10).

**Three things to verify during execution, because they are the likely failures:**

1. **`ALTER TYPE ... ADD VALUE` in migration 0010.** Postgres 16 allows it in a
   transaction only if the new value is not used in the same transaction. The
   migration does not use it, so it should pass — but if it errors, split the
   `ALTER TYPE` into its own revision. Called out at the step.
2. **Route ordering in `household_expenses.py`.** `/pot` must be declared before
   `/{expense_id}` or FastAPI matches `pot` as a UUID and returns a validation
   error that looks like a bug elsewhere.
3. **`exclude_none=True` on the dashboard** (inherited from Plan 3) will silently
   drop `PotSummary` fields if any of them is ever `None`. They are always
   integers today; keep them that way.
