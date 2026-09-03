# Personal Finance & Transparency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Module 2 (each member's personal ledger — income, expenses, savings, debts, loans between members) and Module 3 (the per-module visibility model that governs what other members can see).

**Architecture:** Same four layers as Plan 1. Module 3 is enforced by a single `VisibilityResolver` reached only through a required FastAPI dependency; each module gets two structurally separate Pydantic schemas (detail and summary) so a summary response physically cannot carry per-record fields. A route-coverage test fails CI if any finance read route omits its policy.

**Tech Stack:** Unchanged from Plan 1.

**Spec:** `docs/superpowers/specs/2026-09-02-family-hub-design.md`

**Depends on:** Plan 1 (`2026-09-02-foundation-and-household.md`) — complete it first.

**Also read before starting:** **`docs/visibility-rules.md` in full.** It is the most security-sensitive document in the project and this plan implements it. Then `docs/data-model.md` §5–§6, `docs/api-contract.md` §4–§7, §9.

---

## Global Constraints

Every constraint from Plan 1 still applies. Repeated here because a fresh implementer sees only this document:

- **Money is `BIGINT` minor units + an ISO-4217 currency code. Never `float`, never `Decimal` on transport.** COP has **0** minor units.
- **All amounts are strictly positive** (`CHECK (amount_minor > 0)`). Direction lives in a kind column, never a sign.
- **Code English, UI Spanish (`es-CO`).** Translate through `docs/glossary.md`.
- **Financial dates are plain `DATE`. Audit fields are `TIMESTAMPTZ` UTC.** Period boundaries computed in the household timezone.
- **No role grants visibility.** Admin resolves identically to a teen. If you write `if role == "admin"` near a finance read, you are writing a bug.
- **A missing visibility setting resolves to the module default, never `public`. Fail closed** (VR-05).
- **A summary carries exactly one number.** No counts, no breakdowns, no dates beyond period bounds, no pagination metadata, no min/max/avg.
- **Denials return a uniform `403 not_visible`** — never `404` in one case and `403` in another.
- **Balances are always derived**, never stored as mutable columns.
- **Log lines never contain amounts, notes, or category names.**
- **Tests run against real PostgreSQL 16, never SQLite.**
- **Commits:** `<type>(<scope>): <subject>`, imperative, ≤ 50 chars, no trailing period.

### Interfaces inherited from Plan 1

Verify these exist before starting. If any signature differs, adapt and note it.

```python
family_api.ids.new_id() -> UUID
family_api.money.minor_units(currency: str) -> int
family_api.money.validate_amount(amount_minor: int) -> None
family_api.errors.DomainError            # .type_slug .status .title
family_api.errors.NotVisibleError        # 403 not_visible
family_api.errors.ForbiddenRoleError     # 403 forbidden_role
family_api.errors.NotFoundError          # 404 not_found
family_api.errors.DerivedRecordError     # 409 derived_record
family_api.db.base.Base, TimestampMixin
family_api.db.session.get_session        # FastAPI dependency
family_api.db.models.household.Household, HouseholdMember
family_api.db.models.seeded.Category, VisibilitySetting
family_api.services.members.CurrentMember, require_admin, derive_age
family_api.services.households.DEFAULT_VISIBILITY  # {"income": "summary", ..., "debts": "private"}
family_api.repositories.base.HouseholdScopedRepository
```

---

## File Structure

```
apps/api/
├── migrations/versions/
│   ├── 0004_transactions.py
│   ├── 0005_savings.py
│   ├── 0006_debts.py
│   └── 0007_member_loans.py
├── src/family_api/
│   ├── periods.py                       # month bounds in the household timezone
│   ├── db/models/
│   │   ├── transaction.py               # Transaction
│   │   ├── savings.py                   # SavingsGoal, SavingsEntry
│   │   ├── debt.py                      # Debt, DebtPayment
│   │   └── loan.py                      # MemberLoan, MemberLoanPayment
│   ├── schemas/
│   │   ├── category.py
│   │   ├── transaction.py               # TransactionResponse + IncomeSummary/ExpenseSummary
│   │   ├── savings.py                   # SavingsGoalResponse + SavingsSummary
│   │   ├── debt.py                      # DebtResponse + DebtSummary
│   │   ├── loan.py
│   │   └── visibility.py
│   ├── services/
│   │   ├── categories.py
│   │   ├── transactions.py
│   │   ├── savings.py
│   │   ├── debts.py
│   │   ├── loans.py
│   │   └── visibility.py                # THE resolver — read visibility-rules.md first
│   └── routers/
│       ├── categories.py
│       ├── me_finance.py                # /me/* own-ledger routes (no resolution)
│       ├── member_finance.py            # /members/{id}/* routes (ALL resolved)
│       ├── loans.py
│       └── visibility.py                # /me/visibility
└── tests/
    ├── unit/{test_periods,test_visibility_resolver}.py
    ├── integration/{test_categories,test_transactions,test_savings,test_debts,test_loans}.py
    └── visibility/{test_matrix,test_route_coverage,test_settings}.py
```

---

### Task 1: Period helpers and household settings

**Files:**
- Create: `apps/api/src/family_api/periods.py`
- Modify: `apps/api/src/family_api/routers/households.py`, `apps/api/src/family_api/schemas/household.py`
- Test: `apps/api/tests/unit/test_periods.py`, `apps/api/tests/integration/test_household_settings.py`

**Interfaces:**
- Consumes: `Household`, `CurrentMember`, `require_admin` (Plan 1).
- Produces: `current_period(timezone: str) -> str` returning `"YYYY-MM"`; `month_bounds(period: str) -> tuple[date, date]`; `parse_period(period: str | None, timezone: str) -> tuple[date, date]`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/unit/test_periods.py`:

```python
from datetime import date

import pytest

from family_api.periods import current_period, month_bounds, parse_period


def test_month_bounds_returns_first_and_last_day() -> None:
    assert month_bounds("2026-09") == (date(2026, 9, 1), date(2026, 9, 30))


def test_month_bounds_handles_february_in_a_leap_year() -> None:
    assert month_bounds("2024-02") == (date(2024, 2, 1), date(2024, 2, 29))


def test_month_bounds_handles_december() -> None:
    assert month_bounds("2026-12") == (date(2026, 12, 1), date(2026, 12, 31))


@pytest.mark.parametrize("bad", ["2026", "2026-13", "26-09", "", "2026/09"])
def test_malformed_period_raises(bad: str) -> None:
    with pytest.raises(ValueError, match="Invalid period"):
        month_bounds(bad)


def test_current_period_uses_the_household_timezone() -> None:
    """L-11: 'this month' must mean what the family means by it."""
    period = current_period("America/Bogota")
    assert len(period) == 7
    assert period[4] == "-"


def test_parse_period_defaults_to_the_current_month() -> None:
    start, end = parse_period(None, "America/Bogota")
    assert start.day == 1
    assert end >= start
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/unit/test_periods.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.periods'`

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/family_api/periods.py`:

```python
"""Period boundaries.

`month_bounds` is pure date arithmetic and needs no timezone — a month has the
same first and last day everywhere. Only "what month is it now" depends on the
household's timezone, which is why that is a separate function.
"""

import calendar
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

PERIOD_PATTERN = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


def month_bounds(period: str) -> tuple[date, date]:
    match = PERIOD_PATTERN.match(period)
    if match is None:
        raise ValueError(f"Invalid period: {period!r}. Expected YYYY-MM.")
    year, month = int(match.group(1)), int(match.group(2))
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def current_period(timezone: str) -> str:
    """The month it is *for this household*, not for the server."""
    now = datetime.now(ZoneInfo(timezone))
    return f"{now.year:04d}-{now.month:02d}"


def parse_period(period: str | None, timezone: str) -> tuple[date, date]:
    return month_bounds(period or current_period(timezone))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/unit/test_periods.py -v`
Expected: PASS — 9 tests

- [ ] **Step 5: Write the household settings test**

Create `apps/api/tests/integration/test_household_settings.py`:

```python
import pytest
from httpx import AsyncClient


async def _admin(client: AsyncClient) -> str:
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    token = registered.json()["access_token"]
    await client.post(
        "/api/v1/households",
        json={"name": "Familia Hernández"},
        headers={"Authorization": f"Bearer {token}"},
    )
    return token


@pytest.mark.asyncio
async def test_admin_can_rename_the_household(client: AsyncClient) -> None:
    token = await _admin(client)
    response = await client.patch(
        "/api/v1/households/current",
        json={"name": "Casa Hernández"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Casa Hernández"


@pytest.mark.asyncio
async def test_currency_cannot_be_changed(client: AsyncClient) -> None:
    """Changing currency would reinterpret every stored amount."""
    token = await _admin(client)
    response = await client.patch(
        "/api/v1/households/current",
        json={"currency": "USD"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code in (200, 422)
    current = await client.get(
        "/api/v1/households/current", headers={"Authorization": f"Bearer {token}"}
    )
    assert current.json()["currency"] == "COP"
```

- [ ] **Step 6: Add the schema and route**

Append to `apps/api/src/family_api/schemas/household.py`:

```python
class UpdateHouseholdRequest(BaseModel):
    """Currency is deliberately absent: it is immutable after creation."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    timezone: str | None = None
```

Append to `apps/api/src/family_api/routers/households.py`:

```python
from family_api.schemas.household import UpdateHouseholdRequest
from family_api.services.members import require_admin


@router.patch("/current")
async def update_household(
    body: UpdateHouseholdRequest, member: CurrentMember, session: SessionDep
) -> HouseholdResponse:
    require_admin(member)
    household = await session.get(Household, member.household_id)
    if household is None:
        raise NotFoundError
    if body.name is not None:
        household.name = body.name
    if body.timezone is not None:
        household.timezone = body.timezone
    await session.commit()
    return HouseholdResponse(
        id=household.id, name=household.name, currency=household.currency,
        timezone=household.timezone, my_role=member.role,
    )
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/unit/test_periods.py tests/integration/test_household_settings.py -v`
Expected: PASS — 11 tests

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/family_api apps/api/tests
git commit -m "feat(api): add period helpers and settings"
```

---

### Task 2: Category CRUD

**Files:**
- Create: `apps/api/src/family_api/schemas/category.py`, `apps/api/src/family_api/services/categories.py`, `apps/api/src/family_api/routers/categories.py`
- Modify: `apps/api/src/family_api/main.py`
- Test: `apps/api/tests/integration/test_categories.py`

**Interfaces:**
- Consumes: `Category` (Plan 1), `CurrentMember`.
- Produces: `list_categories(session, member, kind, include_archived) -> list[Category]`; `create_category(session, member, kind, name, icon) -> Category`; `update_category(session, member, category_id, name, icon) -> Category`; `archive_category(session, member, category_id) -> None`; `CategoryResponse`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_categories.py`:

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
    token = registered.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=headers)
    return headers


@pytest.mark.asyncio
async def test_seeded_expense_categories_are_listed(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.get("/api/v1/categories?kind=expense", headers=headers)

    assert response.status_code == 200
    names = {c["name"] for c in response.json()}
    assert {"Transporte", "Comida", "Salud", "Aporte al hogar"} <= names


@pytest.mark.asyncio
async def test_member_can_create_a_category(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.post(
        "/api/v1/categories", json={"kind": "expense", "name": "Mascotas"}, headers=headers
    )

    assert response.status_code == 201
    assert response.json()["name"] == "Mascotas"
    assert response.json()["is_system"] is False


@pytest.mark.asyncio
async def test_duplicate_category_name_in_the_same_kind_is_rejected(
    client: AsyncClient,
) -> None:
    headers = await _member(client)
    await client.post(
        "/api/v1/categories", json={"kind": "expense", "name": "Mascotas"}, headers=headers
    )
    response = await client.post(
        "/api/v1/categories", json={"kind": "expense", "name": "Mascotas"}, headers=headers
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_deleting_a_category_archives_it(client: AsyncClient) -> None:
    headers = await _member(client)
    created = await client.post(
        "/api/v1/categories", json={"kind": "expense", "name": "Mascotas"}, headers=headers
    )
    category_id = created.json()["id"]

    deleted = await client.delete(f"/api/v1/categories/{category_id}", headers=headers)
    assert deleted.status_code == 204

    listed = await client.get("/api/v1/categories?kind=expense", headers=headers)
    assert "Mascotas" not in {c["name"] for c in listed.json()}

    with_archived = await client.get(
        "/api/v1/categories?kind=expense&include_archived=true", headers=headers
    )
    assert "Mascotas" in {c["name"] for c in with_archived.json()}


@pytest.mark.asyncio
async def test_system_categories_archive_but_are_never_deleted(
    client: AsyncClient,
) -> None:
    """FR-M2-02: archiving preserves them on historical records."""
    headers = await _member(client)
    listed = await client.get("/api/v1/categories?kind=expense", headers=headers)
    comida_id = next(c["id"] for c in listed.json() if c["name"] == "Comida")

    deleted = await client.delete(f"/api/v1/categories/{comida_id}", headers=headers)
    assert deleted.status_code == 204

    with_archived = await client.get(
        "/api/v1/categories?kind=expense&include_archived=true", headers=headers
    )
    comida = next(c for c in with_archived.json() if c["name"] == "Comida")
    assert comida["archived_at"] is not None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_categories.py -v`
Expected: FAIL — 404 on `/api/v1/categories`

- [ ] **Step 3: Write the schemas**

Create `apps/api/src/family_api/schemas/category.py`:

```python
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateCategoryRequest(BaseModel):
    kind: Literal["income", "expense"]
    name: str = Field(min_length=1, max_length=60)
    icon: str | None = None


class UpdateCategoryRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    icon: str | None = None


class CategoryResponse(BaseModel):
    id: UUID
    kind: str
    name: str
    icon: str | None
    is_system: bool
    archived_at: datetime | None
```

- [ ] **Step 4: Write the service**

Create `apps/api/src/family_api/services/categories.py`:

```python
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.seeded import Category
from family_api.errors import DomainError, NotFoundError
from family_api.ids import new_id


class DuplicateCategoryError(DomainError):
    type_slug = "duplicate_category"
    status = 409
    title = "Ya existe una categoría con ese nombre"


async def list_categories(
    session: AsyncSession,
    member: HouseholdMember,
    kind: str | None = None,
    include_archived: bool = False,
) -> list[Category]:
    stmt = select(Category).where(Category.household_id == member.household_id)
    if kind is not None:
        stmt = stmt.where(Category.kind == kind)
    if not include_archived:
        stmt = stmt.where(Category.archived_at.is_(None))
    return list(await session.scalars(stmt.order_by(Category.name)))


async def create_category(
    session: AsyncSession, member: HouseholdMember, kind: str, name: str, icon: str | None
) -> Category:
    category = Category(
        id=new_id(), household_id=member.household_id,
        kind=kind, name=name, icon=icon, is_system=False,
    )
    session.add(category)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise DuplicateCategoryError from exc
    return category


async def _load(
    session: AsyncSession, member: HouseholdMember, category_id: UUID
) -> Category:
    category = await session.scalar(
        select(Category).where(
            Category.id == category_id, Category.household_id == member.household_id
        )
    )
    if category is None:
        raise NotFoundError
    return category


async def update_category(
    session: AsyncSession,
    member: HouseholdMember,
    category_id: UUID,
    name: str | None,
    icon: str | None,
) -> Category:
    category = await _load(session, member, category_id)
    if name is not None:
        category.name = name
    if icon is not None:
        category.icon = icon
    await session.flush()
    return category


async def archive_category(
    session: AsyncSession, member: HouseholdMember, category_id: UUID
) -> None:
    """Archive, never delete. Historical records keep their category (FR-M2-02)."""
    category = await _load(session, member, category_id)
    if category.archived_at is None:
        category.archived_at = datetime.now(UTC)
    await session.flush()
```

- [ ] **Step 5: Write the router**

Create `apps/api/src/family_api/routers/categories.py`:

```python
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.session import get_session
from family_api.schemas.category import (
    CategoryResponse, CreateCategoryRequest, UpdateCategoryRequest,
)
from family_api.services import categories as category_service
from family_api.services.members import CurrentMember

router = APIRouter(prefix="/categories", tags=["categories"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("")
async def list_categories(
    member: CurrentMember,
    session: SessionDep,
    kind: Literal["income", "expense"] | None = None,
    include_archived: bool = False,
) -> list[CategoryResponse]:
    rows = await category_service.list_categories(session, member, kind, include_archived)
    return [CategoryResponse.model_validate(r, from_attributes=True) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CreateCategoryRequest, member: CurrentMember, session: SessionDep
) -> CategoryResponse:
    category = await category_service.create_category(
        session, member, body.kind, body.name, body.icon
    )
    await session.commit()
    return CategoryResponse.model_validate(category, from_attributes=True)


@router.patch("/{category_id}")
async def update_category(
    category_id: UUID,
    body: UpdateCategoryRequest,
    member: CurrentMember,
    session: SessionDep,
) -> CategoryResponse:
    category = await category_service.update_category(
        session, member, category_id, body.name, body.icon
    )
    await session.commit()
    return CategoryResponse.model_validate(category, from_attributes=True)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_category(
    category_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await category_service.archive_category(session, member, category_id)
    await session.commit()
```

Mount in `main.py`: add `categories` to the router imports and `app.include_router(categories.router, prefix=API_PREFIX)`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_categories.py -v`
Expected: PASS — 5 tests

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/integration/test_categories.py
git commit -m "feat(categories): add household category crud"
```

---

### Task 3: Transaction model and own-ledger endpoints

**Files:**
- Create: `apps/api/src/family_api/db/models/transaction.py`, `apps/api/migrations/versions/0004_transactions.py`, `apps/api/src/family_api/schemas/transaction.py`, `apps/api/src/family_api/services/transactions.py`, `apps/api/src/family_api/routers/me_finance.py`
- Modify: `apps/api/src/family_api/db/models/__init__.py`, `apps/api/src/family_api/main.py`
- Test: `apps/api/tests/integration/test_transactions.py`

**Interfaces:**
- Consumes: `Category`, `HouseholdMember`, `validate_amount`, `parse_period`.
- Produces: `Transaction(id, household_id, member_id, kind, category_id, amount_minor, occurred_on, note, source, source_id)`; `list_transactions(session, member, kind, category_id, start, end, limit, cursor) -> list[Transaction]`; `create_transaction(session, member, kind, category_id, amount_minor, occurred_on, note) -> Transaction`; `update_transaction(...)`; `delete_transaction(session, member, transaction_id) -> None`; `total_for(session, member_id, kind, start, end) -> int`; `TransactionResponse`, `MoneyTotalResponse`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_transactions.py`:

```python
import pytest
from httpx import AsyncClient


async def _member(client: AsyncClient, email: str = "daniel@example.com") -> dict[str, str]:
    registered = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery", "display_name": "Daniel"},
    )
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=headers)
    return headers


async def _category(client: AsyncClient, headers: dict[str, str], name: str, kind: str) -> str:
    listed = await client.get(f"/api/v1/categories?kind={kind}", headers=headers)
    return next(c["id"] for c in listed.json() if c["name"] == name)


@pytest.mark.asyncio
async def test_member_can_record_an_expense(client: AsyncClient) -> None:
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")

    response = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense",
            "category_id": category_id,
            "amount_minor": 15000,
            "occurred_on": "2026-09-02",
            "note": "Arroz 2kg",
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["amount_minor"] == 15000
    assert body["currency"] == "COP"
    assert body["source"] == "manual"


@pytest.mark.asyncio
async def test_amounts_must_be_positive(client: AsyncClient) -> None:
    """L-08: direction lives in `kind`, never in a sign."""
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")

    for amount in (0, -15000):
        response = await client.post(
            "/api/v1/me/transactions",
            json={
                "kind": "expense", "category_id": category_id,
                "amount_minor": amount, "occurred_on": "2026-09-02",
            },
            headers=headers,
        )
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_category_kind_must_match_transaction_kind(client: AsyncClient) -> None:
    """INV-D-04."""
    headers = await _member(client)
    salario = await _category(client, headers, "Salario", "income")

    response = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_id": salario,
            "amount_minor": 15000, "occurred_on": "2026-09-02",
        },
        headers=headers,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_transactions_are_listed_for_a_period(client: AsyncClient) -> None:
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")
    for day, amount in (("2026-09-02", 15000), ("2026-08-15", 99000)):
        await client.post(
            "/api/v1/me/transactions",
            json={
                "kind": "expense", "category_id": category_id,
                "amount_minor": amount, "occurred_on": day,
            },
            headers=headers,
        )

    response = await client.get(
        "/api/v1/me/transactions?kind=expense&period=2026-09", headers=headers
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["amount_minor"] == 15000


@pytest.mark.asyncio
async def test_member_can_edit_and_delete_their_own_transaction(
    client: AsyncClient,
) -> None:
    headers = await _member(client)
    category_id = await _category(client, headers, "Comida", "expense")
    created = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_id": category_id,
            "amount_minor": 15000, "occurred_on": "2026-09-02",
        },
        headers=headers,
    )
    transaction_id = created.json()["id"]

    patched = await client.patch(
        f"/api/v1/me/transactions/{transaction_id}",
        json={"amount_minor": 18000},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["amount_minor"] == 18000

    deleted = await client.delete(
        f"/api/v1/me/transactions/{transaction_id}", headers=headers
    )
    assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_a_member_cannot_touch_another_members_transaction(
    client: AsyncClient,
) -> None:
    """FR-M2-04: nobody edits another member's ledger, admin included."""
    daniel = await _member(client, "daniel@example.com")
    category_id = await _category(client, daniel, "Comida", "expense")
    created = await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_id": category_id,
            "amount_minor": 15000, "occurred_on": "2026-09-02",
        },
        headers=daniel,
    )
    transaction_id = created.json()["id"]

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

    response = await client.patch(
        f"/api/v1/me/transactions/{transaction_id}",
        json={"amount_minor": 1},
        headers=papa,
    )

    assert response.status_code == 404
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_transactions.py -v`
Expected: FAIL — 404 on `/api/v1/me/transactions`

- [ ] **Step 3: Write the model**

Create `apps/api/src/family_api/db/models/transaction.py`:

```python
from datetime import date
from uuid import UUID

from sqlalchemy import (
    BigInteger, CheckConstraint, Date, ForeignKey, Index, Text,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

transaction_kind = PgEnum(
    "income", "expense", name="transaction_kind", create_type=False
)
transaction_source = PgEnum(
    "manual", "contribution", name="transaction_source", create_type=False
)


class Transaction(Base, TimestampMixin):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_transaction_amount_positive"),
        CheckConstraint(
            "(source = 'manual' AND source_id IS NULL) "
            "OR (source <> 'manual' AND source_id IS NOT NULL)",
            name="ck_transaction_source_id",
        ),
        Index("ix_transaction_ledger", "household_id", "member_id", "occurred_on"),
        Index("ix_transaction_totals", "household_id", "member_id", "kind", "occurred_on"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(transaction_kind, nullable=False)
    category_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Rows with source <> 'manual' are derived records: the transactions API
    # refuses to edit or delete them (FR-M2-05).
    source: Mapped[str] = mapped_column(
        transaction_source, nullable=False, server_default="manual"
    )
    source_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
```

Add to `db/models/__init__.py`: `from family_api.db.models.transaction import Transaction` and append `"Transaction"` to `__all__`.

- [ ] **Step 4: Generate and correct the migration**

Run: `cd apps/api && alembic revision --autogenerate -m "transactions"`

Rename to `0004_transactions.py`, set `down_revision = "0003_households"`. **Remove any enum creation** autogenerate adds — `transaction_kind` and `transaction_source` already exist from `0001_enums`. Enum columns must render as `postgresql.ENUM(name="transaction_kind", create_type=False)`.

Apply: `DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`

- [ ] **Step 5: Write the schemas**

Create `apps/api/src/family_api/schemas/transaction.py`:

```python
from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateTransactionRequest(BaseModel):
    kind: Literal["income", "expense"]
    category_id: UUID
    amount_minor: int = Field(gt=0)
    occurred_on: date
    note: str | None = None


class UpdateTransactionRequest(BaseModel):
    category_id: UUID | None = None
    amount_minor: int | None = Field(default=None, gt=0)
    occurred_on: date | None = None
    note: str | None = None


class TransactionResponse(BaseModel):
    id: UUID
    kind: str
    category_id: UUID
    category_name: str
    amount_minor: int
    currency: str
    occurred_on: date
    note: str | None
    source: str


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    next_cursor: str | None
```

- [ ] **Step 6: Write the service**

Create `apps/api/src/family_api/services/transactions.py`:

```python
from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.seeded import Category
from family_api.db.models.transaction import Transaction
from family_api.errors import DerivedRecordError, NotFoundError
from family_api.ids import new_id


class CategoryKindMismatchError(Exception):
    """Raised as a 422 by the router. INV-D-04."""


async def _resolve_category(
    session: AsyncSession, member: HouseholdMember, category_id: UUID, kind: str
) -> Category:
    category = await session.scalar(
        select(Category).where(
            Category.id == category_id, Category.household_id == member.household_id
        )
    )
    if category is None:
        raise NotFoundError
    if category.kind != kind:
        raise CategoryKindMismatchError
    return category


async def create_transaction(
    session: AsyncSession,
    member: HouseholdMember,
    kind: str,
    category_id: UUID,
    amount_minor: int,
    occurred_on: date,
    note: str | None = None,
) -> Transaction:
    """The owner is always the caller. A member cannot write into another's ledger."""
    await _resolve_category(session, member, category_id, kind)
    transaction = Transaction(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        kind=kind, category_id=category_id, amount_minor=amount_minor,
        occurred_on=occurred_on, note=note, source="manual",
    )
    session.add(transaction)
    await session.flush()
    return transaction


async def list_transactions(
    session: AsyncSession,
    member_id: UUID,
    household_id: UUID,
    kind: str | None,
    start: date,
    end: date,
    category_id: UUID | None = None,
    limit: int = 50,
) -> list[tuple[Transaction, str]]:
    stmt = (
        select(Transaction, Category.name)
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.household_id == household_id,
            Transaction.member_id == member_id,
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        )
    )
    if kind is not None:
        stmt = stmt.where(Transaction.kind == kind)
    if category_id is not None:
        stmt = stmt.where(Transaction.category_id == category_id)
    stmt = stmt.order_by(Transaction.occurred_on.desc(), Transaction.id.desc()).limit(limit)
    return [(t, name) for t, name in (await session.execute(stmt)).all()]


async def total_for(
    session: AsyncSession, member_id: UUID, kind: str, start: date, end: date
) -> int:
    """Computed in the database, in integers. Never in Python floats."""
    total = await session.scalar(
        select(func.coalesce(func.sum(Transaction.amount_minor), 0)).where(
            Transaction.member_id == member_id,
            Transaction.kind == kind,
            Transaction.occurred_on >= start,
            Transaction.occurred_on <= end,
        )
    )
    return int(total or 0)


async def _own_transaction(
    session: AsyncSession, member: HouseholdMember, transaction_id: UUID
) -> Transaction:
    transaction = await session.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id, Transaction.member_id == member.id
        )
    )
    if transaction is None:
        # 404, not 403: to this member the row does not exist in their ledger.
        raise NotFoundError
    if transaction.source != "manual":
        raise DerivedRecordError
    return transaction


async def update_transaction(
    session: AsyncSession,
    member: HouseholdMember,
    transaction_id: UUID,
    category_id: UUID | None,
    amount_minor: int | None,
    occurred_on: date | None,
    note: str | None,
) -> Transaction:
    transaction = await _own_transaction(session, member, transaction_id)
    if category_id is not None:
        await _resolve_category(session, member, category_id, transaction.kind)
        transaction.category_id = category_id
    if amount_minor is not None:
        transaction.amount_minor = amount_minor
    if occurred_on is not None:
        transaction.occurred_on = occurred_on
    if note is not None:
        transaction.note = note
    await session.flush()
    return transaction


async def delete_transaction(
    session: AsyncSession, member: HouseholdMember, transaction_id: UUID
) -> None:
    transaction = await _own_transaction(session, member, transaction_id)
    await session.delete(transaction)
    await session.flush()
```

- [ ] **Step 7: Write the router**

Create `apps/api/src/family_api/routers/me_finance.py`:

```python
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household
from family_api.db.session import get_session
from family_api.periods import parse_period
from family_api.schemas.transaction import (
    CreateTransactionRequest, TransactionListResponse, TransactionResponse,
    UpdateTransactionRequest,
)
from family_api.services import transactions as transaction_service
from family_api.services.members import CurrentMember
from family_api.services.transactions import CategoryKindMismatchError

router = APIRouter(prefix="/me", tags=["own-finance"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _currency(session: AsyncSession, household_id: UUID) -> str:
    household = await session.get(Household, household_id)
    assert household is not None
    return household.currency


async def _timezone(session: AsyncSession, household_id: UUID) -> str:
    household = await session.get(Household, household_id)
    assert household is not None
    return household.timezone


@router.get("/transactions")
async def list_transactions(
    member: CurrentMember,
    session: SessionDep,
    kind: Literal["income", "expense"] | None = None,
    period: str | None = None,
    category_id: UUID | None = None,
    limit: int = 50,
) -> TransactionListResponse:
    start, end = parse_period(period, await _timezone(session, member.household_id))
    currency = await _currency(session, member.household_id)
    rows = await transaction_service.list_transactions(
        session, member.id, member.household_id, kind, start, end, category_id, min(limit, 200)
    )
    return TransactionListResponse(
        items=[
            TransactionResponse(
                id=t.id, kind=t.kind, category_id=t.category_id, category_name=name,
                amount_minor=t.amount_minor, currency=currency,
                occurred_on=t.occurred_on, note=t.note, source=t.source,
            )
            for t, name in rows
        ],
        next_cursor=None,
    )


@router.post("/transactions", status_code=status.HTTP_201_CREATED)
async def create_transaction(
    body: CreateTransactionRequest, member: CurrentMember, session: SessionDep
) -> TransactionResponse:
    try:
        transaction = await transaction_service.create_transaction(
            session, member, body.kind, body.category_id,
            body.amount_minor, body.occurred_on, body.note,
        )
    except CategoryKindMismatchError:
        raise HTTPException(
            status_code=422, detail="Category kind does not match transaction kind"
        ) from None
    await session.commit()
    rows = await transaction_service.list_transactions(
        session, member.id, member.household_id, transaction.kind,
        transaction.occurred_on, transaction.occurred_on,
    )
    name = next(n for t, n in rows if t.id == transaction.id)
    return TransactionResponse(
        id=transaction.id, kind=transaction.kind, category_id=transaction.category_id,
        category_name=name, amount_minor=transaction.amount_minor,
        currency=await _currency(session, member.household_id),
        occurred_on=transaction.occurred_on, note=transaction.note,
        source=transaction.source,
    )


@router.patch("/transactions/{transaction_id}")
async def update_transaction(
    transaction_id: UUID,
    body: UpdateTransactionRequest,
    member: CurrentMember,
    session: SessionDep,
) -> TransactionResponse:
    try:
        transaction = await transaction_service.update_transaction(
            session, member, transaction_id, body.category_id,
            body.amount_minor, body.occurred_on, body.note,
        )
    except CategoryKindMismatchError:
        raise HTTPException(status_code=422, detail="Category kind mismatch") from None
    await session.commit()
    rows = await transaction_service.list_transactions(
        session, member.id, member.household_id, transaction.kind,
        transaction.occurred_on, transaction.occurred_on,
    )
    name = next(n for t, n in rows if t.id == transaction.id)
    return TransactionResponse(
        id=transaction.id, kind=transaction.kind, category_id=transaction.category_id,
        category_name=name, amount_minor=transaction.amount_minor,
        currency=await _currency(session, member.household_id),
        occurred_on=transaction.occurred_on, note=transaction.note,
        source=transaction.source,
    )


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await transaction_service.delete_transaction(session, member, transaction_id)
    await session.commit()
```

Mount in `main.py`: `app.include_router(me_finance.router, prefix=API_PREFIX)`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_transactions.py -v`
Expected: PASS — 6 tests

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/family_api apps/api/migrations apps/api/tests/integration/test_transactions.py
git commit -m "feat(finance): add transactions and own ledger"
```

---

### Task 4: Savings goals with derived balances

**Files:**
- Create: `apps/api/src/family_api/db/models/savings.py`, `apps/api/migrations/versions/0005_savings.py`, `apps/api/src/family_api/schemas/savings.py`, `apps/api/src/family_api/services/savings.py`
- Modify: `apps/api/src/family_api/db/models/__init__.py`, `apps/api/src/family_api/routers/me_finance.py`
- Test: `apps/api/tests/integration/test_savings.py`

**Interfaces:**
- Consumes: `HouseholdMember`, `NotFoundError`.
- Produces: `SavingsGoal(id, household_id, member_id, name, target_amount_minor, target_date, archived_at)`; `SavingsEntry(id, household_id, goal_id, kind, amount_minor, occurred_on, note)`; `list_goals_with_balances(session, member_id) -> list[tuple[SavingsGoal, int]]`; `create_goal(...)`; `add_entry(...)`; `total_balance(session, member_id) -> int`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_savings.py`:

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


@pytest.mark.asyncio
async def test_member_can_create_a_goal(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Moto", "target_amount_minor": 8000000},
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Moto"
    assert body["balance_minor"] == 0
    assert body["progress"] == 0.0


@pytest.mark.asyncio
async def test_balance_is_deposits_minus_withdrawals(client: AsyncClient) -> None:
    """FR-M2-08 / L-09: derived, never a stored column."""
    headers = await _member(client)
    created = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Moto", "target_amount_minor": 8000000},
        headers=headers,
    )
    goal_id = created.json()["id"]

    for kind, amount in (("deposit", 500000), ("deposit", 300000), ("withdrawal", 100000)):
        await client.post(
            f"/api/v1/me/savings-goals/{goal_id}/entries",
            json={"kind": kind, "amount_minor": amount, "occurred_on": "2026-09-02"},
            headers=headers,
        )

    listed = await client.get("/api/v1/me/savings-goals", headers=headers)
    goal = listed.json()[0]

    assert goal["balance_minor"] == 700000
    assert goal["progress"] == pytest.approx(0.0875)


@pytest.mark.asyncio
async def test_progress_is_reported_truthfully_above_target(client: AsyncClient) -> None:
    """FR-M2-09: the API reports the truth; the client caps the display."""
    headers = await _member(client)
    created = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Viaje", "target_amount_minor": 100000},
        headers=headers,
    )
    goal_id = created.json()["id"]
    await client.post(
        f"/api/v1/me/savings-goals/{goal_id}/entries",
        json={"kind": "deposit", "amount_minor": 150000, "occurred_on": "2026-09-02"},
        headers=headers,
    )

    listed = await client.get("/api/v1/me/savings-goals", headers=headers)
    assert listed.json()[0]["progress"] == pytest.approx(1.5)


@pytest.mark.asyncio
async def test_no_stored_balance_column_exists() -> None:
    """L-09: a stored balance is a second source of truth waiting to disagree."""
    from family_api.db.models.savings import SavingsGoal

    assert "balance_minor" not in SavingsGoal.__table__.columns


@pytest.mark.asyncio
async def test_entries_must_be_positive(client: AsyncClient) -> None:
    headers = await _member(client)
    created = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Moto", "target_amount_minor": 8000000},
        headers=headers,
    )
    goal_id = created.json()["id"]

    response = await client.post(
        f"/api/v1/me/savings-goals/{goal_id}/entries",
        json={"kind": "deposit", "amount_minor": -1, "occurred_on": "2026-09-02"},
        headers=headers,
    )

    assert response.status_code == 422
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_savings.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.db.models.savings'`

- [ ] **Step 3: Write the models**

Create `apps/api/src/family_api/db/models/savings.py`:

```python
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger, CheckConstraint, Date, DateTime, ForeignKey, Index, String, Text,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

savings_entry_kind = PgEnum(
    "deposit", "withdrawal", name="savings_entry_kind", create_type=False
)


class SavingsGoal(Base, TimestampMixin):
    """No balance column by design.

    Balance is SUM(deposits) - SUM(withdrawals), computed on read (FR-M2-08).
    A stored balance is a second source of truth waiting to disagree.
    """

    __tablename__ = "savings_goals"
    __table_args__ = (
        CheckConstraint("target_amount_minor > 0", name="ck_goal_target_positive"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    target_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SavingsEntry(Base, TimestampMixin):
    __tablename__ = "savings_entries"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_savings_entry_positive"),
        Index("ix_savings_entry_goal", "goal_id", "occurred_on"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    goal_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("savings_goals.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(savings_entry_kind, nullable=False)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
```

Register both in `db/models/__init__.py`.

- [ ] **Step 4: Generate and correct the migration**

Run: `cd apps/api && alembic revision --autogenerate -m "savings"`

Rename to `0005_savings.py`, `down_revision = "0004_transactions"`. Remove enum creation for `savings_entry_kind`; it exists from `0001_enums`.

Apply: `DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`

- [ ] **Step 5: Write the schemas**

Create `apps/api/src/family_api/schemas/savings.py`:

```python
from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateGoalRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    target_amount_minor: int = Field(gt=0)
    target_date: date | None = None


class CreateEntryRequest(BaseModel):
    kind: Literal["deposit", "withdrawal"]
    amount_minor: int = Field(gt=0)
    occurred_on: date
    note: str | None = None


class SavingsGoalResponse(BaseModel):
    id: UUID
    name: str
    target_amount_minor: int
    target_date: date | None
    balance_minor: int
    progress: float
    currency: str
```

- [ ] **Step 6: Write the service**

Create `apps/api/src/family_api/services/savings.py`:

```python
from datetime import date
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.savings import SavingsEntry, SavingsGoal
from family_api.errors import NotFoundError
from family_api.ids import new_id

_SIGNED_AMOUNT = case(
    (SavingsEntry.kind == "deposit", SavingsEntry.amount_minor),
    else_=-SavingsEntry.amount_minor,
)


async def create_goal(
    session: AsyncSession,
    member: HouseholdMember,
    name: str,
    target_amount_minor: int,
    target_date: date | None,
) -> SavingsGoal:
    goal = SavingsGoal(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        name=name, target_amount_minor=target_amount_minor, target_date=target_date,
    )
    session.add(goal)
    await session.flush()
    return goal


async def list_goals_with_balances(
    session: AsyncSession, member_id: UUID
) -> list[tuple[SavingsGoal, int]]:
    stmt = (
        select(SavingsGoal, func.coalesce(func.sum(_SIGNED_AMOUNT), 0))
        .outerjoin(SavingsEntry, SavingsEntry.goal_id == SavingsGoal.id)
        .where(SavingsGoal.member_id == member_id, SavingsGoal.archived_at.is_(None))
        .group_by(SavingsGoal.id)
        .order_by(SavingsGoal.name)
    )
    return [(goal, int(balance or 0)) for goal, balance in (await session.execute(stmt)).all()]


async def total_balance(session: AsyncSession, member_id: UUID) -> int:
    """The single number the savings summary returns."""
    total = await session.scalar(
        select(func.coalesce(func.sum(_SIGNED_AMOUNT), 0))
        .select_from(SavingsEntry)
        .join(SavingsGoal, SavingsGoal.id == SavingsEntry.goal_id)
        .where(SavingsGoal.member_id == member_id)
    )
    return int(total or 0)


async def _own_goal(
    session: AsyncSession, member: HouseholdMember, goal_id: UUID
) -> SavingsGoal:
    goal = await session.scalar(
        select(SavingsGoal).where(
            SavingsGoal.id == goal_id, SavingsGoal.member_id == member.id
        )
    )
    if goal is None:
        raise NotFoundError
    return goal


async def add_entry(
    session: AsyncSession,
    member: HouseholdMember,
    goal_id: UUID,
    kind: str,
    amount_minor: int,
    occurred_on: date,
    note: str | None,
) -> SavingsEntry:
    goal = await _own_goal(session, member, goal_id)
    entry = SavingsEntry(
        id=new_id(), household_id=goal.household_id, goal_id=goal.id,
        kind=kind, amount_minor=amount_minor, occurred_on=occurred_on, note=note,
    )
    session.add(entry)
    await session.flush()
    return entry


def progress(balance_minor: int, target_amount_minor: int) -> float:
    """Reported truthfully, including above 1.0. The client caps the display."""
    if target_amount_minor <= 0:
        return 0.0
    return balance_minor / target_amount_minor
```

- [ ] **Step 7: Add the routes**

Append to `apps/api/src/family_api/routers/me_finance.py`:

```python
from family_api.schemas.savings import CreateEntryRequest, CreateGoalRequest, SavingsGoalResponse
from family_api.services import savings as savings_service


@router.get("/savings-goals")
async def list_goals(member: CurrentMember, session: SessionDep) -> list[SavingsGoalResponse]:
    currency = await _currency(session, member.household_id)
    rows = await savings_service.list_goals_with_balances(session, member.id)
    return [
        SavingsGoalResponse(
            id=g.id, name=g.name, target_amount_minor=g.target_amount_minor,
            target_date=g.target_date, balance_minor=balance,
            progress=savings_service.progress(balance, g.target_amount_minor),
            currency=currency,
        )
        for g, balance in rows
    ]


@router.post("/savings-goals", status_code=status.HTTP_201_CREATED)
async def create_goal(
    body: CreateGoalRequest, member: CurrentMember, session: SessionDep
) -> SavingsGoalResponse:
    goal = await savings_service.create_goal(
        session, member, body.name, body.target_amount_minor, body.target_date
    )
    await session.commit()
    return SavingsGoalResponse(
        id=goal.id, name=goal.name, target_amount_minor=goal.target_amount_minor,
        target_date=goal.target_date, balance_minor=0, progress=0.0,
        currency=await _currency(session, member.household_id),
    )


@router.post("/savings-goals/{goal_id}/entries", status_code=status.HTTP_201_CREATED)
async def add_entry(
    goal_id: UUID, body: CreateEntryRequest, member: CurrentMember, session: SessionDep
) -> SavingsGoalResponse:
    await savings_service.add_entry(
        session, member, goal_id, body.kind, body.amount_minor, body.occurred_on, body.note
    )
    await session.commit()
    rows = await savings_service.list_goals_with_balances(session, member.id)
    goal, balance = next((g, b) for g, b in rows if g.id == goal_id)
    return SavingsGoalResponse(
        id=goal.id, name=goal.name, target_amount_minor=goal.target_amount_minor,
        target_date=goal.target_date, balance_minor=balance,
        progress=savings_service.progress(balance, goal.target_amount_minor),
        currency=await _currency(session, member.household_id),
    )
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_savings.py -v`
Expected: PASS — 5 tests

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/family_api apps/api/migrations apps/api/tests/integration/test_savings.py
git commit -m "feat(savings): add goals with derived balances"
```

---

### Task 5: Debts with derived outstanding

**Files:**
- Create: `apps/api/src/family_api/db/models/debt.py`, `apps/api/migrations/versions/0006_debts.py`, `apps/api/src/family_api/schemas/debt.py`, `apps/api/src/family_api/services/debts.py`
- Modify: `apps/api/src/family_api/db/models/__init__.py`, `apps/api/src/family_api/routers/me_finance.py`
- Test: `apps/api/tests/integration/test_debts.py`

**Interfaces:**
- Consumes: `HouseholdMember`, `NotFoundError`.
- Produces: `Debt(id, household_id, member_id, creditor_type, creditor_label, principal_minor, annual_interest_rate, due_day, status)`; `DebtPayment(id, household_id, debt_id, amount_minor, paid_on, note)`; `list_debts_with_outstanding(session, member_id) -> list[tuple[Debt, int]]`; `total_outstanding(session, member_id) -> int`; `create_debt(...)`; `add_payment(...)`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_debts.py`:

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_debts.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.db.models.debt'`

- [ ] **Step 3: Write the models**

Create `apps/api/src/family_api/db/models/debt.py`:

```python
from datetime import date
from uuid import UUID

from sqlalchemy import (
    BigInteger, CheckConstraint, Date, ForeignKey, Index, Numeric, SmallInteger, String, Text,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

debt_creditor_type = PgEnum(
    "bank", "family", "credit_card", "addi", "other",
    name="debt_creditor_type", create_type=False,
)
debt_status = PgEnum("active", "paid", "cancelled", name="debt_status", create_type=False)


class Debt(Base, TimestampMixin):
    """Owed to someone OUTSIDE the household.

    A debt between two household members is a `MemberLoan`, a different table
    with different rules (docs/glossary.md §2).
    """

    __tablename__ = "debts"
    __table_args__ = (
        CheckConstraint("principal_minor > 0", name="ck_debt_principal_positive"),
        CheckConstraint(
            "due_day IS NULL OR (due_day BETWEEN 1 AND 31)", name="ck_debt_due_day"
        ),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    creditor_type: Mapped[str] = mapped_column(debt_creditor_type, nullable=False)
    creditor_label: Mapped[str] = mapped_column(String(120), nullable=False)
    principal_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    annual_interest_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    due_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    status: Mapped[str] = mapped_column(debt_status, nullable=False, server_default="active")


class DebtPayment(Base, TimestampMixin):
    __tablename__ = "debt_payments"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_debt_payment_positive"),
        Index("ix_debt_payment_debt", "debt_id", "paid_on"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    debt_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("debts.id", ondelete="CASCADE"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
```

Register both in `db/models/__init__.py`.

- [ ] **Step 4: Generate and correct the migration**

Run: `cd apps/api && alembic revision --autogenerate -m "debts"`

Rename to `0006_debts.py`, `down_revision = "0005_savings"`. Remove enum creation for `debt_creditor_type` and `debt_status`.

Apply: `DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`

- [ ] **Step 5: Write the schemas**

Create `apps/api/src/family_api/schemas/debt.py`:

```python
from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateDebtRequest(BaseModel):
    creditor_type: Literal["bank", "family", "credit_card", "addi", "other"]
    creditor_label: str = Field(min_length=1, max_length=120)
    principal_minor: int = Field(gt=0)
    annual_interest_rate: float | None = Field(default=None, ge=0, le=999.99)
    due_day: int | None = Field(default=None, ge=1, le=31)


class CreateDebtPaymentRequest(BaseModel):
    amount_minor: int = Field(gt=0)
    paid_on: date
    note: str | None = None


class DebtResponse(BaseModel):
    id: UUID
    creditor_type: str
    creditor_label: str
    principal_minor: int
    outstanding_minor: int
    annual_interest_rate: float | None
    due_day: int | None
    status: str
    currency: str
```

- [ ] **Step 6: Write the service**

Create `apps/api/src/family_api/services/debts.py`:

```python
from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.debt import Debt, DebtPayment
from family_api.db.models.household import HouseholdMember
from family_api.errors import DomainError, NotFoundError
from family_api.ids import new_id


class OverpaymentError(DomainError):
    type_slug = "overpayment"
    status = 409
    title = "El pago supera el saldo pendiente"


async def create_debt(
    session: AsyncSession,
    member: HouseholdMember,
    creditor_type: str,
    creditor_label: str,
    principal_minor: int,
    annual_interest_rate: float | None,
    due_day: int | None,
) -> Debt:
    debt = Debt(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        creditor_type=creditor_type, creditor_label=creditor_label,
        principal_minor=principal_minor, annual_interest_rate=annual_interest_rate,
        due_day=due_day, status="active",
    )
    session.add(debt)
    await session.flush()
    return debt


async def _paid_total(session: AsyncSession, debt_id: UUID) -> int:
    total = await session.scalar(
        select(func.coalesce(func.sum(DebtPayment.amount_minor), 0)).where(
            DebtPayment.debt_id == debt_id
        )
    )
    return int(total or 0)


async def list_debts_with_outstanding(
    session: AsyncSession, member_id: UUID
) -> list[tuple[Debt, int]]:
    stmt = (
        select(
            Debt,
            Debt.principal_minor - func.coalesce(func.sum(DebtPayment.amount_minor), 0),
        )
        .outerjoin(DebtPayment, DebtPayment.debt_id == Debt.id)
        .where(Debt.member_id == member_id, Debt.status != "cancelled")
        .group_by(Debt.id)
        .order_by(Debt.creditor_label)
    )
    return [(debt, int(out or 0)) for debt, out in (await session.execute(stmt)).all()]


async def total_outstanding(session: AsyncSession, member_id: UUID) -> int:
    """The single number the debts summary returns."""
    rows = await list_debts_with_outstanding(session, member_id)
    return sum(out for _, out in rows)


async def add_payment(
    session: AsyncSession,
    member: HouseholdMember,
    debt_id: UUID,
    amount_minor: int,
    paid_on: date,
    note: str | None,
) -> Debt:
    debt = await session.scalar(
        select(Debt).where(Debt.id == debt_id, Debt.member_id == member.id).with_for_update()
    )
    if debt is None:
        raise NotFoundError

    outstanding = debt.principal_minor - await _paid_total(session, debt.id)
    if amount_minor > outstanding:
        raise OverpaymentError

    session.add(
        DebtPayment(
            id=new_id(), household_id=debt.household_id, debt_id=debt.id,
            amount_minor=amount_minor, paid_on=paid_on, note=note,
        )
    )
    await session.flush()

    debt.status = "paid" if outstanding - amount_minor == 0 else "active"
    await session.flush()
    return debt
```

- [ ] **Step 7: Add the routes**

Append to `apps/api/src/family_api/routers/me_finance.py`:

```python
from family_api.schemas.debt import CreateDebtPaymentRequest, CreateDebtRequest, DebtResponse
from family_api.services import debts as debt_service


@router.get("/debts")
async def list_debts(member: CurrentMember, session: SessionDep) -> list[DebtResponse]:
    currency = await _currency(session, member.household_id)
    rows = await debt_service.list_debts_with_outstanding(session, member.id)
    return [
        DebtResponse(
            id=d.id, creditor_type=d.creditor_type, creditor_label=d.creditor_label,
            principal_minor=d.principal_minor, outstanding_minor=out,
            annual_interest_rate=float(d.annual_interest_rate)
            if d.annual_interest_rate is not None else None,
            due_day=d.due_day, status=d.status, currency=currency,
        )
        for d, out in rows
    ]


@router.post("/debts", status_code=status.HTTP_201_CREATED)
async def create_debt(
    body: CreateDebtRequest, member: CurrentMember, session: SessionDep
) -> DebtResponse:
    debt = await debt_service.create_debt(
        session, member, body.creditor_type, body.creditor_label,
        body.principal_minor, body.annual_interest_rate, body.due_day,
    )
    await session.commit()
    return DebtResponse(
        id=debt.id, creditor_type=debt.creditor_type, creditor_label=debt.creditor_label,
        principal_minor=debt.principal_minor, outstanding_minor=debt.principal_minor,
        annual_interest_rate=body.annual_interest_rate, due_day=debt.due_day,
        status=debt.status, currency=await _currency(session, member.household_id),
    )


@router.post("/debts/{debt_id}/payments", status_code=status.HTTP_201_CREATED)
async def add_debt_payment(
    debt_id: UUID,
    body: CreateDebtPaymentRequest,
    member: CurrentMember,
    session: SessionDep,
) -> DebtResponse:
    await debt_service.add_payment(
        session, member, debt_id, body.amount_minor, body.paid_on, body.note
    )
    await session.commit()
    rows = await debt_service.list_debts_with_outstanding(session, member.id)
    debt, outstanding = next((d, o) for d, o in rows if d.id == debt_id)
    return DebtResponse(
        id=debt.id, creditor_type=debt.creditor_type, creditor_label=debt.creditor_label,
        principal_minor=debt.principal_minor, outstanding_minor=outstanding,
        annual_interest_rate=float(debt.annual_interest_rate)
        if debt.annual_interest_rate is not None else None,
        due_day=debt.due_day, status=debt.status,
        currency=await _currency(session, member.household_id),
    )
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_debts.py -v`
Expected: PASS — 5 tests

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/family_api apps/api/migrations apps/api/tests/integration/test_debts.py
git commit -m "feat(debts): add debts with derived outstanding"
```

---

### Task 6: Loans between members

The "one fact, one row" table. This is the task where the two-sides-cannot-disagree property is established.

**Files:**
- Create: `apps/api/src/family_api/db/models/loan.py`, `apps/api/migrations/versions/0007_member_loans.py`, `apps/api/src/family_api/schemas/loan.py`, `apps/api/src/family_api/services/loans.py`, `apps/api/src/family_api/routers/loans.py`
- Modify: `apps/api/src/family_api/db/models/__init__.py`, `apps/api/src/family_api/main.py`
- Test: `apps/api/tests/integration/test_loans.py`

**Interfaces:**
- Consumes: `HouseholdMember`, `ForbiddenRoleError`, `NotFoundError`.
- Produces: `MemberLoan(id, household_id, lender_member_id, borrower_member_id, amount_minor, lent_on, due_on, status, note)`; `MemberLoanPayment(...)`; `create_loan(...)`; `list_loans(session, member, role_filter) -> list[tuple[MemberLoan, int]]`; `add_loan_payment(...)`; `cancel_loan(...)`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_loans.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_loans.py -v`
Expected: FAIL — 404 on `/api/v1/loans`

- [ ] **Step 3: Write the models**

Create `apps/api/src/family_api/db/models/loan.py`:

```python
from datetime import date
from uuid import UUID

from sqlalchemy import (
    BigInteger, CheckConstraint, Date, ForeignKey, Index, Text,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

loan_status = PgEnum(
    "pending", "partially_paid", "paid", "cancelled", name="loan_status", create_type=False
)


class MemberLoan(Base, TimestampMixin):
    """One fact, one row.

    Both parties are named on this single row, so the lender's receivable and
    the borrower's payable are literally the same record and cannot drift
    apart (FR-M2-12, FR-M2-13).
    """

    __tablename__ = "member_loans"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_loan_amount_positive"),
        CheckConstraint(
            "lender_member_id <> borrower_member_id", name="ck_loan_distinct_parties"
        ),
        Index("ix_loan_lender", "household_id", "lender_member_id"),
        Index("ix_loan_borrower", "household_id", "borrower_member_id"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    lender_member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    borrower_member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    lent_on: Mapped[date] = mapped_column(Date, nullable=False)
    due_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(loan_status, nullable=False, server_default="pending")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class MemberLoanPayment(Base, TimestampMixin):
    __tablename__ = "member_loan_payments"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_loan_payment_positive"),
        Index("ix_loan_payment_loan", "loan_id", "paid_on"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    loan_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("member_loans.id", ondelete="CASCADE"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    recorded_by_member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("household_members.id"), nullable=False
    )
```

Register both in `db/models/__init__.py`.

- [ ] **Step 4: Generate and correct the migration**

Run: `cd apps/api && alembic revision --autogenerate -m "member loans"`

Rename to `0007_member_loans.py`, `down_revision = "0006_debts"`. Remove enum creation for `loan_status`.

Apply: `DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`

- [ ] **Step 5: Write the schemas**

Create `apps/api/src/family_api/schemas/loan.py`:

```python
from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CreateLoanRequest(BaseModel):
    lender_member_id: UUID
    borrower_member_id: UUID
    amount_minor: int = Field(gt=0)
    lent_on: date
    due_on: date | None = None
    note: str | None = None

    @model_validator(mode="after")
    def parties_must_differ(self) -> "CreateLoanRequest":
        if self.lender_member_id == self.borrower_member_id:
            raise ValueError("Lender and borrower must be different members")
        return self


class CreateLoanPaymentRequest(BaseModel):
    amount_minor: int = Field(gt=0)
    paid_on: date


class LoanResponse(BaseModel):
    id: UUID
    lender_member_id: UUID
    lender_name: str
    borrower_member_id: UUID
    borrower_name: str
    amount_minor: int
    outstanding_minor: int
    currency: str
    lent_on: date
    due_on: date | None
    status: str
    note: str | None
    # "lender" or "borrower" — which side the caller is on.
    perspective: str
```

- [ ] **Step 6: Write the service**

Create `apps/api/src/family_api/services/loans.py`:

```python
from datetime import date
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.loan import MemberLoan, MemberLoanPayment
from family_api.errors import ForbiddenRoleError, NotFoundError
from family_api.ids import new_id
from family_api.services.debts import OverpaymentError


async def _assert_party_is_valid(
    session: AsyncSession, household_id: UUID, member_id: UUID
) -> HouseholdMember:
    member = await session.scalar(
        select(HouseholdMember).where(
            HouseholdMember.id == member_id, HouseholdMember.household_id == household_id
        )
    )
    if member is None:
        raise NotFoundError
    if member.role == "guest":
        # FR-M2-15: a guest has no ledger and cannot be a loan party.
        raise ForbiddenRoleError
    return member


async def create_loan(
    session: AsyncSession,
    actor: HouseholdMember,
    lender_member_id: UUID,
    borrower_member_id: UUID,
    amount_minor: int,
    lent_on: date,
    due_on: date | None,
    note: str | None,
) -> MemberLoan:
    if actor.id not in (lender_member_id, borrower_member_id):
        # You cannot write a debt into two other people's books.
        raise ForbiddenRoleError
    await _assert_party_is_valid(session, actor.household_id, lender_member_id)
    await _assert_party_is_valid(session, actor.household_id, borrower_member_id)

    loan = MemberLoan(
        id=new_id(), household_id=actor.household_id,
        lender_member_id=lender_member_id, borrower_member_id=borrower_member_id,
        amount_minor=amount_minor, lent_on=lent_on, due_on=due_on,
        status="pending", note=note,
    )
    session.add(loan)
    await session.flush()
    return loan


async def _paid_total(session: AsyncSession, loan_id: UUID) -> int:
    total = await session.scalar(
        select(func.coalesce(func.sum(MemberLoanPayment.amount_minor), 0)).where(
            MemberLoanPayment.loan_id == loan_id
        )
    )
    return int(total or 0)


async def list_loans(
    session: AsyncSession, member: HouseholdMember, role_filter: str = "all"
) -> list[tuple[MemberLoan, int]]:
    """FR-M2-16: both parties always see their own loans, whatever their settings."""
    stmt = select(
        MemberLoan,
        MemberLoan.amount_minor - func.coalesce(func.sum(MemberLoanPayment.amount_minor), 0),
    ).outerjoin(MemberLoanPayment, MemberLoanPayment.loan_id == MemberLoan.id)

    if role_filter == "lender":
        stmt = stmt.where(MemberLoan.lender_member_id == member.id)
    elif role_filter == "borrower":
        stmt = stmt.where(MemberLoan.borrower_member_id == member.id)
    else:
        stmt = stmt.where(
            or_(
                MemberLoan.lender_member_id == member.id,
                MemberLoan.borrower_member_id == member.id,
            )
        )

    stmt = stmt.group_by(MemberLoan.id).order_by(MemberLoan.lent_on.desc())
    return [(loan, int(out or 0)) for loan, out in (await session.execute(stmt)).all()]


async def _load_party_loan(
    session: AsyncSession, member: HouseholdMember, loan_id: UUID
) -> MemberLoan:
    loan = await session.scalar(
        select(MemberLoan)
        .where(
            MemberLoan.id == loan_id,
            MemberLoan.household_id == member.household_id,
            or_(
                MemberLoan.lender_member_id == member.id,
                MemberLoan.borrower_member_id == member.id,
            ),
        )
        .with_for_update()
    )
    if loan is None:
        raise NotFoundError
    return loan


async def add_loan_payment(
    session: AsyncSession,
    member: HouseholdMember,
    loan_id: UUID,
    amount_minor: int,
    paid_on: date,
) -> MemberLoan:
    """Either party may record a payment (FR-M2-14)."""
    loan = await _load_party_loan(session, member, loan_id)
    outstanding = loan.amount_minor - await _paid_total(session, loan.id)
    if amount_minor > outstanding:
        raise OverpaymentError

    session.add(
        MemberLoanPayment(
            id=new_id(), household_id=loan.household_id, loan_id=loan.id,
            amount_minor=amount_minor, paid_on=paid_on, recorded_by_member_id=member.id,
        )
    )
    await session.flush()

    remaining = outstanding - amount_minor
    loan.status = "paid" if remaining == 0 else "partially_paid"
    await session.flush()
    return loan


async def cancel_loan(
    session: AsyncSession, member: HouseholdMember, loan_id: UUID
) -> None:
    """Only the lender may cancel (FR-M2-14)."""
    loan = await _load_party_loan(session, member, loan_id)
    if loan.lender_member_id != member.id:
        raise ForbiddenRoleError
    loan.status = "cancelled"
    await session.flush()
```

- [ ] **Step 7: Write the router**

Create `apps/api/src/family_api/routers/loans.py`:

```python
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.user import User
from family_api.db.session import get_session
from family_api.schemas.loan import CreateLoanPaymentRequest, CreateLoanRequest, LoanResponse
from family_api.services import loans as loan_service
from family_api.services.members import CurrentMember

router = APIRouter(prefix="/loans", tags=["loans"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _names(session: AsyncSession, household_id: UUID) -> dict[UUID, str]:
    rows = (
        await session.execute(
            select(HouseholdMember.id, User.display_name)
            .join(User, User.id == HouseholdMember.user_id)
            .where(HouseholdMember.household_id == household_id)
        )
    ).all()
    return {member_id: name for member_id, name in rows}


async def _render(
    session: AsyncSession, member: HouseholdMember, loan, outstanding: int
) -> LoanResponse:
    household = await session.get(Household, member.household_id)
    assert household is not None
    names = await _names(session, member.household_id)
    return LoanResponse(
        id=loan.id,
        lender_member_id=loan.lender_member_id,
        lender_name=names.get(loan.lender_member_id, ""),
        borrower_member_id=loan.borrower_member_id,
        borrower_name=names.get(loan.borrower_member_id, ""),
        amount_minor=loan.amount_minor, outstanding_minor=outstanding,
        currency=household.currency, lent_on=loan.lent_on, due_on=loan.due_on,
        status=loan.status, note=loan.note,
        perspective="lender" if loan.lender_member_id == member.id else "borrower",
    )


@router.get("")
async def list_loans(
    member: CurrentMember,
    session: SessionDep,
    role: Literal["lender", "borrower", "all"] = "all",
) -> list[LoanResponse]:
    rows = await loan_service.list_loans(session, member, role)
    return [await _render(session, member, loan, out) for loan, out in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_loan(
    body: CreateLoanRequest, member: CurrentMember, session: SessionDep
) -> LoanResponse:
    loan = await loan_service.create_loan(
        session, member, body.lender_member_id, body.borrower_member_id,
        body.amount_minor, body.lent_on, body.due_on, body.note,
    )
    await session.commit()
    return await _render(session, member, loan, loan.amount_minor)


@router.post("/{loan_id}/payments", status_code=status.HTTP_201_CREATED)
async def add_payment(
    loan_id: UUID,
    body: CreateLoanPaymentRequest,
    member: CurrentMember,
    session: SessionDep,
) -> LoanResponse:
    await loan_service.add_loan_payment(
        session, member, loan_id, body.amount_minor, body.paid_on
    )
    await session.commit()
    rows = await loan_service.list_loans(session, member, "all")
    loan, outstanding = next((loan, out) for loan, out in rows if loan.id == loan_id)
    return await _render(session, member, loan, outstanding)


@router.delete("/{loan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_loan(
    loan_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await loan_service.cancel_loan(session, member, loan_id)
    await session.commit()
```

Mount in `main.py`: `app.include_router(loans.router, prefix=API_PREFIX)`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_loans.py -v`
Expected: PASS — 7 tests

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/family_api apps/api/migrations apps/api/tests/integration/test_loans.py
git commit -m "feat(loans): add single-row member loans"
```

---

### Task 7: The visibility resolver

**Read `docs/visibility-rules.md` §2 before this task.** This is the security core of the product.

**Files:**
- Create: `apps/api/src/family_api/services/visibility.py`
- Test: `apps/api/tests/unit/test_visibility_resolver.py`

**Interfaces:**
- Consumes: `HouseholdMember`, `VisibilitySetting`, `DEFAULT_VISIBILITY` (Plan 1).
- Produces: `Level` StrEnum with `FULL`, `SUMMARY`, `NONE`; `resolve(session, viewer, owner, module) -> Level`; `VisibilityScope` dataclass with `viewer`, `owner`, `level`, `module`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/unit/test_visibility_resolver.py`:

```python
"""Unit tests for the resolver's decision logic.

The full endpoint matrix lives in tests/visibility/test_matrix.py. These cover
the rules in isolation, with a fake session, so a logic error is reported here
rather than as forty confusing endpoint failures.
"""

from dataclasses import dataclass
from uuid import UUID, uuid4

import pytest

from family_api.services.visibility import Level, resolve


@dataclass
class FakeMember:
    id: UUID
    household_id: UUID
    role: str


class FakeSession:
    def __init__(self, level: str | None = None, raises: bool = False) -> None:
        self._level = level
        self._raises = raises

    async def scalar(self, *_args, **_kwargs) -> str | None:
        if self._raises:
            raise RuntimeError("database is unreachable")
        return self._level


HOUSEHOLD = uuid4()


def member(role: str = "adult", household_id: UUID = HOUSEHOLD) -> FakeMember:
    return FakeMember(id=uuid4(), household_id=household_id, role=role)


@pytest.mark.asyncio
async def test_a_member_always_sees_their_own_data_in_full() -> None:
    """VR-03: settings describe what OTHERS see, never what you see."""
    me = member()
    assert await resolve(FakeSession("private"), me, me, "debts") is Level.FULL


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["admin", "adult", "teen"])
async def test_no_role_grants_extra_visibility(role: str) -> None:
    """VR-01: an administrator resolves identically to a teen."""
    viewer, owner = member(role), member()
    assert await resolve(FakeSession("private"), viewer, owner, "debts") is Level.NONE
    assert await resolve(FakeSession("summary"), viewer, owner, "income") is Level.SUMMARY
    assert await resolve(FakeSession("public"), viewer, owner, "income") is Level.FULL


@pytest.mark.asyncio
async def test_a_guest_sees_nothing_even_when_the_owner_is_public() -> None:
    """VR-02: public means public TO THE HOUSEHOLD; a guest is a visitor."""
    assert await resolve(FakeSession("public"), member("guest"), member(), "income") is Level.NONE


@pytest.mark.asyncio
async def test_cross_household_is_denied_before_anything_else() -> None:
    """VR-04."""
    viewer = member(household_id=uuid4())
    assert await resolve(FakeSession("public"), viewer, member(), "income") is Level.NONE


@pytest.mark.asyncio
async def test_a_missing_setting_falls_back_to_the_module_default() -> None:
    """VR-05: never `public`. Debts default to private."""
    viewer, owner = member(), member()
    assert await resolve(FakeSession(None), viewer, owner, "debts") is Level.NONE
    assert await resolve(FakeSession(None), viewer, owner, "income") is Level.SUMMARY


@pytest.mark.asyncio
async def test_a_lookup_failure_fails_closed() -> None:
    """VR-05: if the resolver cannot decide, it denies."""
    viewer, owner = member(), member()
    assert await resolve(FakeSession(raises=True), viewer, owner, "income") is Level.NONE


@pytest.mark.asyncio
async def test_self_check_precedes_the_guest_denial() -> None:
    """A guest is not given a ledger, but the ordering must still be right."""
    me = member("guest")
    assert await resolve(FakeSession("private"), me, me, "income") is Level.FULL
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/unit/test_visibility_resolver.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.services.visibility'`

- [ ] **Step 3: Write the resolver**

Create `apps/api/src/family_api/services/visibility.py`:

```python
"""The visibility resolver.

READ docs/visibility-rules.md BEFORE CHANGING ANYTHING HERE.

This is the security core of the product. A bug here is not a defect, it is a
breach, and it is silent — nobody files a bug report saying "I can see my
father's salary".
"""

import logging
from dataclasses import dataclass
from enum import StrEnum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.seeded import VisibilitySetting
from family_api.services.households import DEFAULT_VISIBILITY

logger = logging.getLogger(__name__)

MODULES = ("income", "expenses", "savings", "debts")


class Level(StrEnum):
    FULL = "full"
    SUMMARY = "summary"
    NONE = "none"


_STORED_TO_LEVEL = {
    "public": Level.FULL,
    "summary": Level.SUMMARY,
    "private": Level.NONE,
}


@dataclass(frozen=True)
class VisibilityScope:
    viewer: HouseholdMember
    owner: HouseholdMember
    level: Level
    module: str


async def resolve(
    session: AsyncSession,
    viewer: HouseholdMember,
    owner: HouseholdMember,
    module: str,
) -> Level:
    """Resolve what `viewer` may see of `owner`'s `module`.

    Order matters and is specified in docs/visibility-rules.md §2:
    cross-household first, self second, guest third, stored setting last.
    """
    if viewer.household_id != owner.household_id:
        return Level.NONE

    # Settings govern what OTHERS see. You always see yourself (VR-03).
    if viewer.id == owner.id:
        return Level.FULL

    # Public means public to the household. A guest is a visitor (VR-02).
    if viewer.role == "guest":
        return Level.NONE

    try:
        stored = await session.scalar(
            select(VisibilitySetting.level).where(
                VisibilitySetting.member_id == owner.id,
                VisibilitySetting.module == module,
            )
        )
    except Exception:
        # Fail closed. A resolver that cannot decide must deny (VR-05).
        logger.exception("visibility lookup failed; denying", extra={"module": module})
        return Level.NONE

    if stored is None:
        stored = DEFAULT_VISIBILITY.get(module, "private")

    return _STORED_TO_LEVEL.get(stored, Level.NONE)
```

Note the log call carries only the module name — never an amount, note, or category (Global Constraints).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/unit/test_visibility_resolver.py -v`
Expected: PASS — 9 tests

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/family_api/services/visibility.py apps/api/tests/unit/test_visibility_resolver.py
git commit -m "feat(visibility): add per-module resolver"
```

---

### Task 8: The visibility dependency and summary schemas

**Files:**
- Modify: `apps/api/src/family_api/services/visibility.py`, `apps/api/src/family_api/schemas/transaction.py`, `apps/api/src/family_api/schemas/savings.py`, `apps/api/src/family_api/schemas/debt.py`
- Test: `apps/api/tests/visibility/test_schemas.py`

**Interfaces:**
- Consumes: `resolve`, `Level`, `VisibilityScope` (Task 7).
- Produces: `visibility_for(module: str) -> Callable` returning a FastAPI dependency that yields `VisibilityScope` and raises `NotVisibleError` on `NONE`; the dependency carries `__visibility_policy__ = module`; `MoneyTotalResponse` with exactly `period`, `total_minor`, `currency`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/visibility/__init__.py` (empty) and `apps/api/tests/visibility/test_schemas.py`:

```python
"""A summary schema must be structurally incapable of leaking detail.

docs/visibility-rules.md §3.1 lists what must never appear. Asserting on the
field SET, not on values, is what catches a leak added later by an unrelated
feature.
"""

from family_api.schemas.transaction import MoneyTotalResponse

FORBIDDEN_SUBSTRINGS = (
    "count", "category", "note", "min", "max", "avg", "average",
    "cursor", "has_more", "items", "trend", "largest", "occurred",
)


def test_money_total_has_exactly_three_fields() -> None:
    assert set(MoneyTotalResponse.model_fields) == {"period", "total_minor", "currency"}


def test_money_total_carries_no_forbidden_field() -> None:
    for name in MoneyTotalResponse.model_fields:
        assert not any(bad in name.lower() for bad in FORBIDDEN_SUBSTRINGS), name


def test_summary_shape_is_fixed_regardless_of_data() -> None:
    """One record or a thousand, the payload has the same keys."""
    empty = MoneyTotalResponse(period="2026-09", total_minor=0, currency="COP")
    full = MoneyTotalResponse(period="2026-09", total_minor=5_500_000, currency="COP")
    assert empty.model_dump().keys() == full.model_dump().keys()


def test_detail_and_summary_are_different_classes() -> None:
    """Never one model with fields excluded at serialization time."""
    from family_api.schemas.transaction import TransactionResponse

    assert TransactionResponse is not MoneyTotalResponse
    assert not issubclass(MoneyTotalResponse, TransactionResponse)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/visibility/test_schemas.py -v`
Expected: FAIL — `ImportError: cannot import name 'MoneyTotalResponse'`

- [ ] **Step 3: Add the summary schemas**

Append to `apps/api/src/family_api/schemas/transaction.py`:

```python
class MoneyTotalResponse(BaseModel):
    """A summary is exactly one number plus the period it covers.

    docs/visibility-rules.md §3.1: no counts, no breakdowns, no statistics, no
    dates beyond the period bounds, no pagination metadata. Adding a field to
    this model is a security change — read that section first.
    """

    period: str
    total_minor: int
    currency: str
```

Append to `apps/api/src/family_api/schemas/savings.py`:

```python
class SavingsSummaryResponse(BaseModel):
    """Total balance across all goals. No goal names, no goal count."""

    total_balance_minor: int
    currency: str
```

Append to `apps/api/src/family_api/schemas/debt.py`:

```python
class DebtSummaryResponse(BaseModel):
    """Total outstanding. No creditor names, no creditor types, no count."""

    total_outstanding_minor: int
    currency: str
```

- [ ] **Step 4: Write the dependency**

Append to `apps/api/src/family_api/services/visibility.py`:

```python
from collections.abc import Callable
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy import select as sa_select

from family_api.db.session import get_session
from family_api.errors import NotVisibleError
from family_api.services.members import current_member


def visibility_for(module: str) -> Callable[..., object]:
    """Build the required dependency for a member-scoped read route.

    A route declares its policy in its signature rather than calling a helper
    it might forget. The route-coverage test enforces that every finance read
    route has one.
    """
    if module not in MODULES:
        raise ValueError(f"Unknown visibility module: {module}")

    async def dependency(
        member_id: UUID,
        viewer: Annotated[HouseholdMember, Depends(current_member)],
        session: Annotated[AsyncSession, Depends(get_session)],
    ) -> VisibilityScope:
        # Resolve BEFORE touching any finance table, so a denial costs the same
        # whether the member exists or not (docs/visibility-rules.md §4.4).
        owner = await session.scalar(
            sa_select(HouseholdMember).where(HouseholdMember.id == member_id)
        )
        if owner is None:
            # Uniform with a privacy denial: "does not exist" is information.
            raise NotVisibleError

        level = await resolve(session, viewer, owner, module)
        if level is Level.NONE:
            raise NotVisibleError
        return VisibilityScope(viewer=viewer, owner=owner, level=level, module=module)

    # Read by the route-coverage test.
    dependency.__visibility_policy__ = module  # type: ignore[attr-defined]
    return dependency
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/visibility/test_schemas.py -v`
Expected: PASS — 4 tests

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/visibility
git commit -m "feat(visibility): add dependency and summary schemas"
```

---

### Task 9: Member finance read endpoints

**Files:**
- Create: `apps/api/src/family_api/routers/member_finance.py`
- Modify: `apps/api/src/family_api/main.py`
- Test: `apps/api/tests/visibility/test_member_endpoints.py`

**Interfaces:**
- Consumes: `visibility_for`, `Level`, `VisibilityScope` (Task 8); `total_for` (Task 3); `total_balance`, `list_goals_with_balances` (Task 4); `total_outstanding`, `list_debts_with_outstanding` (Task 5).
- Produces: four `GET /members/{member_id}/{income,expenses,savings,debts}` routes.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/visibility/test_member_endpoints.py`:

```python
import pytest
from httpx import AsyncClient


async def _household_with_papa(client: AsyncClient) -> tuple[dict, dict, str]:
    """Returns (daniel_headers, papa_headers, papa_member_id)."""
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
    listed = await client.get("/api/v1/households/current", headers=daniel)
    papa_id = next(
        m["id"] for m in listed.json()["members"] if m["display_name"] == "Papá"
    )
    return daniel, papa, papa_id


async def _papa_earns(client: AsyncClient, papa: dict, amount: int) -> None:
    listed = await client.get("/api/v1/categories?kind=income", headers=papa)
    salario = next(c["id"] for c in listed.json() if c["name"] == "Salario")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "income", "category_id": salario,
            "amount_minor": amount, "occurred_on": "2026-09-05",
        },
        headers=papa,
    )


async def _set_visibility(client: AsyncClient, papa: dict, module: str, level: str) -> None:
    current = (await client.get("/api/v1/me/visibility", headers=papa)).json()
    payload = {m: current[m] for m in ("income", "expenses", "savings", "debts")}
    payload[module] = level
    await client.put("/api/v1/me/visibility", json=payload, headers=papa)


@pytest.mark.asyncio
async def test_summary_returns_one_number_and_nothing_else(client: AsyncClient) -> None:
    daniel, papa, papa_id = await _household_with_papa(client)
    await _papa_earns(client, papa, 3_000_000)

    response = await client.get(
        f"/api/v1/members/{papa_id}/income?period=2026-09", headers=daniel
    )

    assert response.status_code == 200
    assert set(response.json()) == {"period", "total_minor", "currency"}
    assert response.json()["total_minor"] == 3_000_000


@pytest.mark.asyncio
async def test_public_returns_the_transaction_list(client: AsyncClient) -> None:
    daniel, papa, papa_id = await _household_with_papa(client)
    await _papa_earns(client, papa, 3_000_000)
    await _set_visibility(client, papa, "income", "public")

    response = await client.get(
        f"/api/v1/members/{papa_id}/income?period=2026-09", headers=daniel
    )

    assert response.status_code == 200
    assert response.json()["items"][0]["category_name"] == "Salario"


@pytest.mark.asyncio
async def test_private_returns_a_uniform_denial(client: AsyncClient) -> None:
    daniel, papa, papa_id = await _household_with_papa(client)
    await _papa_earns(client, papa, 3_000_000)
    await _set_visibility(client, papa, "income", "private")

    response = await client.get(
        f"/api/v1/members/{papa_id}/income?period=2026-09", headers=daniel
    )

    assert response.status_code == 403
    assert response.json()["type"] == "not_visible"


@pytest.mark.asyncio
async def test_debts_are_private_by_default(client: AsyncClient) -> None:
    """FR-M3-03."""
    daniel, _, papa_id = await _household_with_papa(client)
    response = await client.get(f"/api/v1/members/{papa_id}/debts", headers=daniel)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_a_member_with_no_records_returns_zero_not_a_denial(
    client: AsyncClient,
) -> None:
    """§3.2: zero and private must never be confusable."""
    daniel, _, papa_id = await _household_with_papa(client)

    response = await client.get(
        f"/api/v1/members/{papa_id}/income?period=2026-09", headers=daniel
    )

    assert response.status_code == 200
    assert response.json()["total_minor"] == 0
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/visibility/test_member_endpoints.py -v`
Expected: FAIL — 404 on `/api/v1/members/...`. `/me/visibility` also does not exist yet (Task 11) — implement Task 11 before running this file, or expect those helper calls to fail first.

- [ ] **Step 3: Write the router**

Create `apps/api/src/family_api/routers/member_finance.py`:

```python
"""Reads of ANOTHER member's finances.

EVERY route in this module declares a visibility dependency. If you add a
route here without one, tests/visibility/test_route_coverage.py fails the
build. That is deliberate.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household
from family_api.db.session import get_session
from family_api.periods import parse_period
from family_api.schemas.debt import DebtResponse, DebtSummaryResponse
from family_api.schemas.savings import SavingsGoalResponse, SavingsSummaryResponse
from family_api.schemas.transaction import (
    MoneyTotalResponse, TransactionListResponse, TransactionResponse,
)
from family_api.services import debts as debt_service
from family_api.services import savings as savings_service
from family_api.services import transactions as transaction_service
from family_api.services.visibility import Level, VisibilityScope, visibility_for

router = APIRouter(prefix="/members", tags=["member-finance"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _household(session: AsyncSession, household_id: UUID) -> Household:
    household = await session.get(Household, household_id)
    assert household is not None
    return household


async def _transactions_view(
    scope: VisibilityScope, session: AsyncSession, kind: str, period: str | None
) -> TransactionListResponse | MoneyTotalResponse:
    household = await _household(session, scope.owner.household_id)
    start, end = parse_period(period, household.timezone)

    if scope.level is Level.SUMMARY:
        total = await transaction_service.total_for(session, scope.owner.id, kind, start, end)
        return MoneyTotalResponse(
            period=f"{start.year:04d}-{start.month:02d}",
            total_minor=total,
            currency=household.currency,
        )

    rows = await transaction_service.list_transactions(
        session, scope.owner.id, scope.owner.household_id, kind, start, end
    )
    return TransactionListResponse(
        items=[
            TransactionResponse(
                id=t.id, kind=t.kind, category_id=t.category_id, category_name=name,
                amount_minor=t.amount_minor, currency=household.currency,
                occurred_on=t.occurred_on, note=t.note, source=t.source,
            )
            for t, name in rows
        ],
        next_cursor=None,
    )


@router.get("/{member_id}/income")
async def member_income(
    scope: Annotated[VisibilityScope, Depends(visibility_for("income"))],
    session: SessionDep,
    period: str | None = None,
) -> TransactionListResponse | MoneyTotalResponse:
    return await _transactions_view(scope, session, "income", period)


@router.get("/{member_id}/expenses")
async def member_expenses(
    scope: Annotated[VisibilityScope, Depends(visibility_for("expenses"))],
    session: SessionDep,
    period: str | None = None,
) -> TransactionListResponse | MoneyTotalResponse:
    return await _transactions_view(scope, session, "expense", period)


@router.get("/{member_id}/savings")
async def member_savings(
    scope: Annotated[VisibilityScope, Depends(visibility_for("savings"))],
    session: SessionDep,
) -> list[SavingsGoalResponse] | SavingsSummaryResponse:
    household = await _household(session, scope.owner.household_id)

    if scope.level is Level.SUMMARY:
        return SavingsSummaryResponse(
            total_balance_minor=await savings_service.total_balance(session, scope.owner.id),
            currency=household.currency,
        )

    rows = await savings_service.list_goals_with_balances(session, scope.owner.id)
    return [
        SavingsGoalResponse(
            id=g.id, name=g.name, target_amount_minor=g.target_amount_minor,
            target_date=g.target_date, balance_minor=balance,
            progress=savings_service.progress(balance, g.target_amount_minor),
            currency=household.currency,
        )
        for g, balance in rows
    ]


@router.get("/{member_id}/debts")
async def member_debts(
    scope: Annotated[VisibilityScope, Depends(visibility_for("debts"))],
    session: SessionDep,
) -> list[DebtResponse] | DebtSummaryResponse:
    household = await _household(session, scope.owner.household_id)

    if scope.level is Level.SUMMARY:
        return DebtSummaryResponse(
            total_outstanding_minor=await debt_service.total_outstanding(
                session, scope.owner.id
            ),
            currency=household.currency,
        )

    rows = await debt_service.list_debts_with_outstanding(session, scope.owner.id)
    return [
        DebtResponse(
            id=d.id, creditor_type=d.creditor_type, creditor_label=d.creditor_label,
            principal_minor=d.principal_minor, outstanding_minor=out,
            annual_interest_rate=float(d.annual_interest_rate)
            if d.annual_interest_rate is not None else None,
            due_day=d.due_day, status=d.status, currency=household.currency,
        )
        for d, out in rows
    ]
```

Mount in `main.py`: `app.include_router(member_finance.router, prefix=API_PREFIX)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/visibility/test_member_endpoints.py -v`
Expected: PASS — 5 tests (after Task 11 provides `/me/visibility`)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/visibility
git commit -m "feat(visibility): add member finance read routes"
```

---

### Task 10: The route coverage test

Converts "someone forgot the dependency" from a silent leak into a red build.

**Files:**
- Test: `apps/api/tests/visibility/test_route_coverage.py`

**Interfaces:**
- Consumes: `create_app`, `__visibility_policy__` marker (Task 8).
- Produces: nothing. This task is a guard.

- [ ] **Step 1: Write the test**

Create `apps/api/tests/visibility/test_route_coverage.py`:

```python
"""Every finance read route must declare a visibility policy.

docs/visibility-rules.md §4.3. Adding a read endpoint without a policy fails
CI rather than leaking quietly.
"""

from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute

from family_api.main import create_app

# Routes that legitimately need no per-member policy. Every entry is a
# deliberate, reviewable decision — not an omission.
EXEMPT_PREFIXES = (
    "/api/v1/health",
    "/api/v1/auth",          # identity, not finance
    "/api/v1/me",            # your own data; you always see yourself (VR-03)
    "/api/v1/households",    # membership and roles carry no financial figures
    "/api/v1/categories",    # household-wide labels, no amounts
    "/api/v1/dashboard",     # household aggregates; resolves per member inline
    "/api/v1/loans",         # FR-M2-16: both parties always see their own loans
    "/api/v1/contribution-periods",  # FR-M4-07: always household-visible
    "/docs",
    "/openapi.json",
    "/redoc",
)


def _declares_policy(dependant: Dependant) -> bool:
    if getattr(dependant.call, "__visibility_policy__", None) is not None:
        return True
    return any(_declares_policy(sub) for sub in dependant.dependencies)


def test_every_member_scoped_read_route_declares_a_visibility_policy() -> None:
    app = create_app()
    offenders: list[str] = []

    for route in app.routes:
        if not isinstance(route, APIRoute) or "GET" not in route.methods:
            continue
        if route.path.startswith(EXEMPT_PREFIXES):
            continue
        if not _declares_policy(route.dependant):
            offenders.append(f"{sorted(route.methods)} {route.path}")

    assert not offenders, (
        "These read routes have no visibility policy. Add "
        "Depends(visibility_for(<module>)) or add the path to EXEMPT_PREFIXES "
        "with a comment explaining why:\n  " + "\n  ".join(offenders)
    )


def test_the_marker_is_actually_detected() -> None:
    """A coverage test that cannot fail is worse than no coverage test."""
    from family_api.services.visibility import visibility_for

    assert getattr(visibility_for("income"), "__visibility_policy__", None) == "income"


def test_member_finance_routes_are_not_accidentally_exempt() -> None:
    """Guards against someone 'fixing' a failure by widening EXEMPT_PREFIXES."""
    assert not any(p.startswith("/api/v1/members") for p in EXEMPT_PREFIXES)

    app = create_app()
    member_routes = [
        r for r in app.routes
        if isinstance(r, APIRoute)
        and r.path.startswith("/api/v1/members")
        and "GET" in r.methods
    ]
    assert len(member_routes) == 4
    assert all(_declares_policy(r.dependant) for r in member_routes)
```

- [ ] **Step 2: Run the test**

Run: `cd apps/api && pytest tests/visibility/test_route_coverage.py -v`
Expected: PASS — 3 tests

If it fails, do **not** widen `EXEMPT_PREFIXES` to make it pass. Add the missing dependency.

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/visibility/test_route_coverage.py
git commit -m "test(visibility): add route policy coverage guard"
```

---

### Task 11: Visibility settings endpoints

**Files:**
- Create: `apps/api/src/family_api/schemas/visibility.py`, `apps/api/src/family_api/routers/visibility.py`
- Modify: `apps/api/src/family_api/main.py`
- Test: `apps/api/tests/visibility/test_settings.py`

**Interfaces:**
- Consumes: `VisibilitySetting`, `CurrentMember`, `MODULES` (Task 7).
- Produces: `GET /me/visibility`, `PUT /me/visibility`; `VisibilitySettingsResponse` carrying the four levels plus `disclosures`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/visibility/test_settings.py`:

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


@pytest.mark.asyncio
async def test_defaults_are_summary_except_debts(client: AsyncClient) -> None:
    """FR-M3-03."""
    headers = await _member(client)
    response = await client.get("/api/v1/me/visibility", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["income"] == "summary"
    assert body["expenses"] == "summary"
    assert body["savings"] == "summary"
    assert body["debts"] == "private"


@pytest.mark.asyncio
async def test_member_can_change_their_own_settings(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.put(
        "/api/v1/me/visibility",
        json={
            "income": "public", "expenses": "private",
            "savings": "public", "debts": "summary",
        },
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["income"] == "public"

    reread = await client.get("/api/v1/me/visibility", headers=headers)
    assert reread.json()["expenses"] == "private"


@pytest.mark.asyncio
async def test_the_response_carries_both_disclosures(client: AsyncClient) -> None:
    """FR-M3-08 / §6: copy lives with the rules so it cannot drift in the UI."""
    headers = await _member(client)
    body = (await client.get("/api/v1/me/visibility", headers=headers)).json()

    disclosures = " ".join(body["disclosures"])
    assert "totales del hogar incluyen a todos" in disclosures
    assert "aportes al hogar siempre son visibles" in disclosures.lower()


@pytest.mark.asyncio
async def test_there_is_no_route_to_set_another_members_visibility(
    client: AsyncClient,
) -> None:
    """FR-M3-06: no role can change someone else's settings."""
    from fastapi.routing import APIRoute

    from family_api.main import create_app

    paths = {
        r.path for r in create_app().routes
        if isinstance(r, APIRoute) and "visibility" in r.path
    }
    assert paths == {"/api/v1/me/visibility"}


@pytest.mark.asyncio
async def test_an_invalid_level_is_rejected(client: AsyncClient) -> None:
    headers = await _member(client)
    response = await client.put(
        "/api/v1/me/visibility",
        json={
            "income": "sometimes", "expenses": "private",
            "savings": "public", "debts": "summary",
        },
        headers=headers,
    )

    assert response.status_code == 422
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/visibility/test_settings.py -v`
Expected: FAIL — 404 on `/api/v1/me/visibility`

- [ ] **Step 3: Write the schema**

Create `apps/api/src/family_api/schemas/visibility.py`:

```python
from typing import Literal

from pydantic import BaseModel

Level = Literal["private", "summary", "public"]

# Spanish copy lives here, next to the rules it describes, so the settings
# screen cannot drift away from what the backend actually does
# (docs/visibility-rules.md §6, spec §8.4).
DISCLOSURES = [
    "Los totales del hogar incluyen a todos. Tu configuración controla si los "
    "demás ven tus números individuales, no si cuentas en el total del hogar.",
    "Los aportes al hogar siempre son visibles para toda la familia.",
]


class VisibilitySettingsRequest(BaseModel):
    income: Level
    expenses: Level
    savings: Level
    debts: Level


class VisibilitySettingsResponse(BaseModel):
    income: Level
    expenses: Level
    savings: Level
    debts: Level
    disclosures: list[str]
```

- [ ] **Step 4: Write the router**

Create `apps/api/src/family_api/routers/visibility.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.seeded import VisibilitySetting
from family_api.db.session import get_session
from family_api.ids import new_id
from family_api.schemas.visibility import (
    DISCLOSURES, VisibilitySettingsRequest, VisibilitySettingsResponse,
)
from family_api.services.households import DEFAULT_VISIBILITY
from family_api.services.members import CurrentMember
from family_api.services.visibility import MODULES

router = APIRouter(prefix="/me/visibility", tags=["visibility"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _current_levels(session: AsyncSession, member_id) -> dict[str, str]:
    rows = await session.scalars(
        select(VisibilitySetting).where(VisibilitySetting.member_id == member_id)
    )
    stored = {row.module: row.level for row in rows}
    # A missing row falls back to the module default, never to public (VR-05).
    return {module: stored.get(module, DEFAULT_VISIBILITY[module]) for module in MODULES}


@router.get("")
async def get_visibility(
    member: CurrentMember, session: SessionDep
) -> VisibilitySettingsResponse:
    levels = await _current_levels(session, member.id)
    return VisibilitySettingsResponse(**levels, disclosures=DISCLOSURES)


@router.put("")
async def set_visibility(
    body: VisibilitySettingsRequest, member: CurrentMember, session: SessionDep
) -> VisibilitySettingsResponse:
    """Self only. There is deliberately no route to set another member's
    visibility, for any role (FR-M3-06)."""
    requested = body.model_dump()
    existing = {
        row.module: row
        for row in await session.scalars(
            select(VisibilitySetting).where(VisibilitySetting.member_id == member.id)
        )
    }

    for module in MODULES:
        level = requested[module]
        if module in existing:
            existing[module].level = level
        else:
            session.add(
                VisibilitySetting(
                    id=new_id(), household_id=member.household_id,
                    member_id=member.id, module=module, level=level,
                )
            )

    await session.commit()
    levels = await _current_levels(session, member.id)
    return VisibilitySettingsResponse(**levels, disclosures=DISCLOSURES)
```

Mount in `main.py`: `app.include_router(visibility.router, prefix=API_PREFIX)`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/visibility -v`
Expected: PASS — settings, schemas, coverage and member endpoints

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/visibility
git commit -m "feat(visibility): add self settings endpoints"
```

---

### Task 12: The visibility matrix test

**The most important test in the repository.** Everything before this task was building the thing this test verifies.

**Files:**
- Test: `apps/api/tests/visibility/test_matrix.py`

**Interfaces:**
- Consumes: every endpoint built so far.
- Produces: nothing. This task is the proof.

- [ ] **Step 1: Write the matrix test**

Create `apps/api/tests/visibility/test_matrix.py`:

```python
"""The visibility matrix.

docs/visibility-rules.md §7. Asserts the EXACT status and the EXACT set of
field names for every combination. Field names, not just values: a future
feature that adds `transaction_count` to a summary would pass a value-only
assertion and leak. It fails this one.
"""

import pytest
from httpx import AsyncClient

MODULES = ["income", "expenses", "savings", "debts"]
LEVELS = ["private", "summary", "public"]

SUMMARY_FIELDS = {
    "income": {"period", "total_minor", "currency"},
    "expenses": {"period", "total_minor", "currency"},
    "savings": {"total_balance_minor", "currency"},
    "debts": {"total_outstanding_minor", "currency"},
}


async def _register(client: AsyncClient, email: str, name: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery", "display_name": name},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _build_household(client: AsyncClient, viewer_role: str) -> tuple[dict, dict, str]:
    """Daniel is admin; the viewer joins with `viewer_role`; Papá is the owner."""
    daniel = await _register(client, "daniel@example.com", "Daniel")
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=daniel)

    async def _join(email: str, name: str, role: str) -> dict[str, str]:
        invite = await client.post(
            "/api/v1/households/current/invites",
            json={"role_granted": role},
            headers=daniel,
        )
        headers = await _register(client, email, name)
        await client.post(
            "/api/v1/households/join",
            json={"code": invite.json()["code"]},
            headers=headers,
        )
        return headers

    papa = await _join("papa@example.com", "Papá", "adult")
    viewer = daniel if viewer_role == "admin" else await _join(
        "viewer@example.com", "Viewer", viewer_role
    )

    listed = await client.get("/api/v1/households/current", headers=daniel)
    papa_id = next(
        m["id"] for m in listed.json()["members"] if m["display_name"] == "Papá"
    )
    return viewer, papa, papa_id


async def _give_papa_data(client: AsyncClient, papa: dict) -> None:
    income = await client.get("/api/v1/categories?kind=income", headers=papa)
    salario = next(c["id"] for c in income.json() if c["name"] == "Salario")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "income", "category_id": salario,
            "amount_minor": 3_000_000, "occurred_on": "2026-09-05",
        },
        headers=papa,
    )
    expense = await client.get("/api/v1/categories?kind=expense", headers=papa)
    comida = next(c["id"] for c in expense.json() if c["name"] == "Comida")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "expense", "category_id": comida,
            "amount_minor": 500_000, "occurred_on": "2026-09-06",
        },
        headers=papa,
    )
    goal = await client.post(
        "/api/v1/me/savings-goals",
        json={"name": "Viaje", "target_amount_minor": 2_000_000},
        headers=papa,
    )
    await client.post(
        f"/api/v1/me/savings-goals/{goal.json()['id']}/entries",
        json={"kind": "deposit", "amount_minor": 400_000, "occurred_on": "2026-09-07"},
        headers=papa,
    )
    await client.post(
        "/api/v1/me/debts",
        json={
            "creditor_type": "addi", "creditor_label": "Addi",
            "principal_minor": 1_200_000,
        },
        headers=papa,
    )


async def _set_all(client: AsyncClient, papa: dict, level: str) -> None:
    await client.put(
        "/api/v1/me/visibility",
        json={m: level for m in MODULES},
        headers=papa,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("viewer_role", ["admin", "adult", "teen"])
@pytest.mark.parametrize("level", LEVELS)
@pytest.mark.parametrize("module", MODULES)
async def test_matrix(
    client: AsyncClient, viewer_role: str, level: str, module: str
) -> None:
    viewer, papa, papa_id = await _build_household(client, viewer_role)
    await _give_papa_data(client, papa)
    await _set_all(client, papa, level)

    response = await client.get(
        f"/api/v1/members/{papa_id}/{module}?period=2026-09", headers=viewer
    )

    if level == "private":
        # VR-01: role is irrelevant. Admin resolves exactly like a teen.
        assert response.status_code == 403
        assert response.json()["type"] == "not_visible"
    elif level == "summary":
        assert response.status_code == 200
        assert set(response.json()) == SUMMARY_FIELDS[module]
    else:
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list) or "items" in body


@pytest.mark.asyncio
@pytest.mark.parametrize("module", MODULES)
async def test_a_guest_sees_nothing_even_when_public(
    client: AsyncClient, module: str
) -> None:
    """VR-02."""
    viewer, papa, papa_id = await _build_household(client, "guest")
    await _give_papa_data(client, papa)
    await _set_all(client, papa, "public")

    response = await client.get(f"/api/v1/members/{papa_id}/{module}", headers=viewer)

    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("module", MODULES)
async def test_owner_always_sees_their_own_data(client: AsyncClient, module: str) -> None:
    """VR-03: even set to private."""
    _, papa, papa_id = await _build_household(client, "adult")
    await _give_papa_data(client, papa)
    await _set_all(client, papa, "private")

    response = await client.get(f"/api/v1/members/{papa_id}/{module}", headers=papa)

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_private_and_empty_are_never_confusable(client: AsyncClient) -> None:
    """V-04 / §3.2."""
    viewer, papa, papa_id = await _build_household(client, "adult")
    await _set_all(client, papa, "summary")

    empty = await client.get(
        f"/api/v1/members/{papa_id}/income?period=2026-09", headers=viewer
    )
    assert empty.status_code == 200
    assert empty.json()["total_minor"] == 0
    assert empty.json()["total_minor"] is not None

    await _set_all(client, papa, "private")
    private = await client.get(
        f"/api/v1/members/{papa_id}/income?period=2026-09", headers=viewer
    )
    assert private.status_code == 403


@pytest.mark.asyncio
async def test_denials_are_byte_identical_across_reasons(client: AsyncClient) -> None:
    """V-05 / §4.4: 'no such member' and 'private' must be indistinguishable."""
    viewer, papa, papa_id = await _build_household(client, "adult")
    await _set_all(client, papa, "private")

    private = await client.get(f"/api/v1/members/{papa_id}/income", headers=viewer)
    missing = await client.get(
        "/api/v1/members/00000000-0000-0000-0000-000000000000/income", headers=viewer
    )

    assert private.status_code == missing.status_code == 403
    assert private.json()["type"] == missing.json()["type"] == "not_visible"
    assert private.json()["title"] == missing.json()["title"]


@pytest.mark.asyncio
async def test_a_setting_change_takes_effect_immediately(client: AsyncClient) -> None:
    """V-09: no caching window."""
    viewer, papa, papa_id = await _build_household(client, "adult")
    await _give_papa_data(client, papa)

    await _set_all(client, papa, "private")
    assert (
        await client.get(f"/api/v1/members/{papa_id}/income", headers=viewer)
    ).status_code == 403

    await _set_all(client, papa, "public")
    assert (
        await client.get(f"/api/v1/members/{papa_id}/income", headers=viewer)
    ).status_code == 200


@pytest.mark.asyncio
async def test_both_loan_parties_see_it_with_debts_private(client: AsyncClient) -> None:
    """V-06 / FR-M2-16: a lender who cannot see their own loan has a worse
    tool than a notebook."""
    viewer, papa, papa_id = await _build_household(client, "adult")
    await _set_all(client, papa, "private")
    await client.put(
        "/api/v1/me/visibility", json={m: "private" for m in MODULES}, headers=viewer
    )

    listed = await client.get("/api/v1/households/current", headers=viewer)
    viewer_id = next(
        m["id"] for m in listed.json()["members"] if m["display_name"] == "Viewer"
    )

    created = await client.post(
        "/api/v1/loans",
        json={
            "lender_member_id": viewer_id, "borrower_member_id": papa_id,
            "amount_minor": 300_000, "lent_on": "2026-09-01",
        },
        headers=viewer,
    )
    assert created.status_code == 201

    for headers in (viewer, papa):
        loans = await client.get("/api/v1/loans", headers=headers)
        assert loans.status_code == 200
        assert len(loans.json()) == 1
```

- [ ] **Step 2: Run the matrix**

Run: `cd apps/api && pytest tests/visibility/test_matrix.py -v`
Expected: PASS — 36 parametrized matrix cases plus 11 targeted cases

Any failure here is a **security defect**, not a test problem. Fix the code, never the assertion.

- [ ] **Step 3: Run the whole suite and the linters**

Run: `cd apps/api && pytest -v && ruff check . && mypy src`
Expected: all PASS. **Paste real output.**

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/visibility/test_matrix.py
git commit -m "test(visibility): add full enforcement matrix"
```

---

## Plan Self-Review

**1. Spec coverage.**

| Requirement | Task |
| ----------- | ---- |
| FR-M2-01 seeded categories | Plan 1 Task 9; verified here in Task 2 |
| FR-M2-02 create/rename/archive, system categories never deleted | 2 |
| FR-M2-03 record income/expense, owner is always the caller | 3 |
| FR-M2-04 nobody edits another member's transactions | 3 |
| FR-M2-05 derived records reject edit/delete | 3 (guard), Plan 3 (creation) |
| FR-M2-06 amounts strictly positive | 3, 4, 5, 6 |
| FR-M2-07 savings goals | 4 |
| FR-M2-08 balance derived, no stored column | 4 |
| FR-M2-09 progress reported truthfully | 4 |
| FR-M2-10 debts with addi creditor type | 5 |
| FR-M2-11 outstanding derived, auto-paid at zero | 5 |
| FR-M2-12/13 one-row loans, two perspectives | 6 |
| FR-M2-14 either party pays, lender cancels | 6 |
| FR-M2-15 guests cannot be loan parties | 6 |
| FR-M2-16 loans visible to both regardless of settings | 6, 12 |
| FR-M3-01/02 per-module levels | 7, 11 |
| FR-M3-03 defaults, debts private | Plan 1 Task 9; verified in 11 |
| FR-M3-04 summary is one number | 8, 9, 12 |
| FR-M3-05 summary is the true total | 9 (no filtering by level) |
| FR-M3-06 self only | 11 |
| FR-M3-08 disclosures | 11 |
| VR-01…VR-05 | 7 |
| §4.1 required dependency · §4.2 two schemas · §4.3 coverage · §4.4 uniform denial | 8, 8, 10, 8+12 |
| §7 matrix | 12 |
| INV-D-04 category kind matches | 3 |
| L-07 overpayment rejected | 5, 6 |
| L-11 period boundaries in household timezone | 1 |

**Deferred, with the plan that owns it:** FR-M3-07 and the contribution override (`visibility-rules.md` §5.2) are Plan 3, since the contribution endpoints do not exist yet. §5.1's *third-member* loan rule — a loan resolving against the borrower's `debts` setting for someone who is not a party — is **not implemented in this plan**: `list_loans` returns only loans the caller is party to, so no third-member view exists yet. It arrives with the dashboard in Plan 3, and Plan 3 Task 8 must add its matrix case.

**2. Placeholder scan.** None.

**3. Type consistency.** `Level` (Task 7 → 8, 9), `VisibilityScope` (7 → 8, 9), `visibility_for` and `__visibility_policy__` (8 → 9, 10), `MODULES` (7 → 11), `DEFAULT_VISIBILITY` (Plan 1 → 7, 11), `total_for` (3 → 9), `total_balance`/`list_goals_with_balances`/`progress` (4 → 9), `total_outstanding`/`list_debts_with_outstanding` (5 → 9), `OverpaymentError` (5 → 6), `parse_period` (1 → 3, 9), `MoneyTotalResponse` (8 → 9, 12).

**One ordering hazard, flagged in Task 9 Step 2:** Task 9's tests call `/me/visibility`, which Task 11 builds. Implement Task 11 before running Task 9's test file, or expect the helper calls to fail first. This is called out at the step rather than left to be discovered.
