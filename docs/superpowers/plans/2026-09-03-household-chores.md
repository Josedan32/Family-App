# Household Chores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Module 8 — recurring household chores assigned by **balancing accumulated effort**, so the household stops re-litigating who does more.

**Architecture:** Same four layers. The whole module rests on one derived number: a member's **effort balance** over a rolling window. Assignment picks the lowest balance and breaks ties at random; absence compensation is emergent from that same rule and needs no second ledger. Nothing about fairness is stored — it is computed from completed assignments plus attributed manual adjustments.

**Tech Stack:** Unchanged.

**Spec:** `docs/superpowers/specs/2026-09-02-family-hub-design.md` §7.4 (FR-M8-01…15)

**Depends on:** Plan 1 (household and members). Independent of Plans 2, 3 and 5 — chores touch no money. Plan 4 for the two UI tasks.

**Also read:** `docs/data-model.md` §8C, `docs/api-contract.md` §13, `docs/testing-strategy.md` §4B, `docs/glossary.md` §5B.

---

## Global Constraints

- **Never call this a "rotation".** Round-robin is the design that was rejected, and the word invites someone to simplify it back into one. It is *assignment by lowest effort balance*.
- **Never call a chore a `task`.** In a repo full of implementation plans, `task` means a unit of implementation work.
- **Effort balance is derived over a rolling window** (default 60 days). No stored balance column.
- **Absence compensation writes no rows.** An absent member earns nothing, so their balance stays flat while others rise, and the existing rule assigns them more on return (FR-M8-13). A debt table would be a second source of truth for fairness.
- **Tie-breaks are random** (FR-M8-07). Sorting by name or join date silently hands the same person the same chore forever.
- **An assignment freezes the chore's effort weight at assignment time** (FR-M8-04). Re-pricing a chore never rewrites history.
- **Guests are never assigned chores** (FR-M8-06).
- **Chores carry no visibility rules** (FR-M8-15). Everything is household-visible. The privacy model exists because money is private; housework's whole purpose is being seen and counted.
- **Only admins create chores or change effort weights** (FR-M8-03) — effort weight is the currency of the system.
- **Code English, UI Spanish (`es-CO`).** Translate through `docs/glossary.md` §5B.
- **Tests against real PostgreSQL 16.**
- **Commits:** `<type>(<scope>): <subject>`, imperative, ≤ 50 chars, no period.

### Interfaces inherited

```python
family_api.ids.new_id() -> UUID
family_api.errors.{DomainError, NotFoundError, ForbiddenRoleError}
family_api.db.base.{Base, TimestampMixin}
family_api.db.models.household.{Household, HouseholdMember}
family_api.db.models.user.User
family_api.services.members.{CurrentMember, require_admin}
family_api.repositories.base.HouseholdScopedRepository
```

---

## File Structure

```
apps/api/
├── migrations/versions/
│   ├── 0011_chores.py
│   └── 0012_absences_and_adjustments.py
├── src/family_api/
│   ├── recurrence.py                   # occurrence dates per frequency
│   ├── db/models/chore.py              # Chore, ChoreCycle, ChoreAssignment,
│   │                                   # MemberAbsence, EffortAdjustment
│   ├── schemas/chore.py
│   ├── services/
│   │   ├── chores.py                   # CRUD + seeding
│   │   ├── effort.py                   # THE balance calculation
│   │   ├── absences.py
│   │   └── assignment.py               # THE algorithm
│   └── routers/chores.py
└── tests/
    ├── unit/{test_recurrence,test_assignment_algorithm}.py
    └── integration/{test_chores,test_absences,test_effort_balances,test_fairness}.py

apps/web/src/
├── app/(app)/tareas/page.tsx
└── components/chores/{ChoreCard,AssignmentRow,EffortBalanceBar,AbsenceForm}.tsx
```

---

### Task 1: Recurrence dates

**Files:**
- Create: `apps/api/src/family_api/recurrence.py`
- Test: `apps/api/tests/unit/test_recurrence.py`

**Interfaces:**
- Consumes: `add_months` from `family_api.dates` (Plan 5 Task 1). **If Plan 5 has not run, create `dates.py` with `add_months` here** — the code is in that plan's Task 1 Step 3.
- Produces: `occurrences(frequency: str, starts_on: date, ends_on: date) -> list[date]`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/unit/test_recurrence.py`:

```python
from datetime import date

import pytest

from family_api.recurrence import occurrences


def test_daily_covers_every_day_inclusive() -> None:
    result = occurrences("daily", date(2026, 9, 1), date(2026, 9, 7))
    assert len(result) == 7
    assert result[0] == date(2026, 9, 1)
    assert result[-1] == date(2026, 9, 7)


def test_weekly_lands_once_per_week() -> None:
    result = occurrences("weekly", date(2026, 9, 1), date(2026, 9, 28))
    assert result == [
        date(2026, 9, 1), date(2026, 9, 8), date(2026, 9, 15), date(2026, 9, 22),
    ]


def test_biweekly_steps_fourteen_days() -> None:
    result = occurrences("biweekly", date(2026, 9, 1), date(2026, 10, 15))
    assert result == [date(2026, 9, 1), date(2026, 9, 15), date(2026, 9, 29),
                      date(2026, 10, 13)]


def test_monthly_keeps_the_day_of_month() -> None:
    result = occurrences("monthly", date(2026, 1, 15), date(2026, 4, 30))
    assert result == [
        date(2026, 1, 15), date(2026, 2, 15), date(2026, 3, 15), date(2026, 4, 15),
    ]


def test_monthly_clamps_in_short_months() -> None:
    result = occurrences("monthly", date(2026, 1, 31), date(2026, 3, 31))
    assert result == [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31)]


def test_a_single_day_range_yields_one_occurrence() -> None:
    assert occurrences("weekly", date(2026, 9, 1), date(2026, 9, 1)) == [
        date(2026, 9, 1)
    ]


def test_an_inverted_range_yields_nothing() -> None:
    assert occurrences("daily", date(2026, 9, 7), date(2026, 9, 1)) == []


def test_an_unknown_frequency_raises() -> None:
    with pytest.raises(ValueError, match="Unknown frequency"):
        occurrences("hourly", date(2026, 9, 1), date(2026, 9, 7))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/unit/test_recurrence.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.recurrence'`

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/family_api/recurrence.py`:

```python
"""When a chore falls due inside a cycle.

Monthly steps by calendar month, not by 30 days, so "the 15th" stays the 15th
instead of drifting backwards through the year.
"""

from datetime import date, timedelta

from family_api.dates import add_months

STEP_DAYS = {"daily": 1, "weekly": 7, "biweekly": 14}


def occurrences(frequency: str, starts_on: date, ends_on: date) -> list[date]:
    if frequency not in STEP_DAYS and frequency != "monthly":
        raise ValueError(f"Unknown frequency: {frequency}")
    if ends_on < starts_on:
        return []

    dates: list[date] = []
    if frequency == "monthly":
        index = 0
        while True:
            current = add_months(starts_on, index)
            if current > ends_on:
                break
            dates.append(current)
            index += 1
        return dates

    step = timedelta(days=STEP_DAYS[frequency])
    current = starts_on
    while current <= ends_on:
        dates.append(current)
        current += step
    return dates
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/unit/test_recurrence.py -v`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/family_api/recurrence.py apps/api/tests/unit/test_recurrence.py
git commit -m "feat(chores): add recurrence date generation"
```

---

### Task 2: Chore models and migration

**Files:**
- Create: `apps/api/src/family_api/db/models/chore.py`, `apps/api/migrations/versions/0011_chores.py`, `0012_absences_and_adjustments.py`
- Modify: `apps/api/src/family_api/db/models/__init__.py`, `db/models/household.py`
- Test: `apps/api/tests/integration/test_chore_models.py`

**Interfaces:**
- Consumes: `Base`, `TimestampMixin`, `Household`, `HouseholdMember`.
- Produces: `Chore`, `ChoreCycle`, `ChoreAssignment`, `MemberAbsence`, `EffortAdjustment`; `Household.effort_window_days`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/test_chore_models.py`:

```python
import pytest

from family_api.db.models.chore import (
    Chore, ChoreAssignment, ChoreCycle, EffortAdjustment, MemberAbsence,
)


def test_effort_points_are_bounded_one_to_ten() -> None:
    names = {c.name for c in Chore.__table__.constraints if c.name}
    assert "ck_chore_effort_range" in names


def test_an_assignment_freezes_its_effort_weight() -> None:
    """FR-M8-04 / INV-D-10: re-pricing never rewrites history."""
    column = ChoreAssignment.__table__.columns["effort_points"]
    assert column.nullable is False


def test_completion_credits_whoever_actually_did_it() -> None:
    """FR-M8-11."""
    assert "completed_by_member_id" in ChoreAssignment.__table__.columns


def test_done_and_completed_at_move_together() -> None:
    names = {c.name for c in ChoreAssignment.__table__.constraints if c.name}
    assert "ck_assignment_completed_at" in names


def test_a_cycle_is_generated_once_per_start_date() -> None:
    uniques = [
        c for c in ChoreCycle.__table__.constraints
        if c.__class__.__name__ == "UniqueConstraint"
    ]
    assert any(
        {col.name for col in c.columns} == {"household_id", "starts_on"} for c in uniques
    )


def test_an_absence_range_is_ordered() -> None:
    names = {c.name for c in MemberAbsence.__table__.constraints if c.name}
    assert "ck_absence_range" in names


def test_an_effort_adjustment_requires_a_reason() -> None:
    """C-12: an unexplained adjustment is indistinguishable from favouritism."""
    assert EffortAdjustment.__table__.columns["reason"].nullable is False


def test_no_stored_effort_balance_exists() -> None:
    from family_api.db.models.household import HouseholdMember

    assert "effort_balance" not in HouseholdMember.__table__.columns
    assert "effort_points" not in HouseholdMember.__table__.columns


def test_households_carry_the_effort_window() -> None:
    from family_api.db.models.household import Household

    assert "effort_window_days" in Household.__table__.columns
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pytest tests/integration/test_chore_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.db.models.chore'`

- [ ] **Step 3: Write the models**

Create `apps/api/src/family_api/db/models/chore.py`:

```python
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, SmallInteger,
    String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

chore_frequency = PgEnum(
    "daily", "weekly", "biweekly", "monthly", name="chore_frequency", create_type=False
)
assignment_status = PgEnum(
    "pending", "done", "skipped", "reassigned",
    name="assignment_status", create_type=False,
)


class Chore(Base, TimestampMixin):
    __tablename__ = "chores"
    __table_args__ = (
        UniqueConstraint("household_id", "name", name="uq_chore_household_name"),
        CheckConstraint(
            "effort_points BETWEEN 1 AND 10", name="ck_chore_effort_range"
        ),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    frequency: Mapped[str] = mapped_column(chore_frequency, nullable=False)
    # The currency of the fairness system. Only admins price it (FR-M8-03).
    effort_points: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ChoreCycle(Base):
    __tablename__ = "chore_cycles"
    __table_args__ = (
        UniqueConstraint("household_id", "starts_on", name="uq_cycle_household_start"),
        CheckConstraint("ends_on >= starts_on", name="ck_cycle_range"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ChoreAssignment(Base, TimestampMixin):
    __tablename__ = "chore_assignments"
    __table_args__ = (
        CheckConstraint(
            "(status = 'done') = (completed_at IS NOT NULL)",
            name="ck_assignment_completed_at",
        ),
        Index("ix_assignment_member", "household_id", "member_id", "due_on"),
        Index("ix_assignment_cycle", "cycle_id"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    cycle_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("chore_cycles.id", ondelete="CASCADE"), nullable=False
    )
    chore_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("chores.id", ondelete="RESTRICT"), nullable=False
    )
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    due_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        assignment_status, nullable=False, server_default="pending"
    )
    # Frozen at assignment time (FR-M8-04). Re-pricing a chore must never
    # retroactively change what someone already earned.
    effort_points: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Credit follows whoever actually did it, not whoever was assigned it.
    completed_by_member_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("household_members.id"), nullable=True
    )


class MemberAbsence(Base, TimestampMixin):
    __tablename__ = "member_absences"
    __table_args__ = (
        CheckConstraint("ends_on >= starts_on", name="ck_absence_range"),
        Index("ix_absence_member", "household_id", "member_id", "starts_on"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="CASCADE"),
        nullable=False,
    )
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)
    # Optional: "I am away" is household business, why may not be.
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class EffortAdjustment(Base, TimestampMixin):
    """Manual, attributed, auditable corrections only (FR-M8-14).

    Absence compensation does NOT write rows here — it is emergent from the
    balance rule (FR-M8-13), and duplicating that mechanism in a table would
    create a second source of truth for fairness.
    """

    __tablename__ = "effort_adjustments"
    __table_args__ = (CheckConstraint("points <> 0", name="ck_adjustment_nonzero"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="CASCADE"),
        nullable=False,
    )
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("household_members.id"), nullable=False
    )
```

Add to `Household` in `db/models/household.py`:

```python
    effort_window_days: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default="60"
    )
```

with `SmallInteger` imported and a `CheckConstraint("effort_window_days BETWEEN 7 AND 365", name="ck_household_effort_window")` in `__table_args__`.

Register all five models in `db/models/__init__.py`.

- [ ] **Step 4: Write the migrations**

Create `apps/api/migrations/versions/0011_chores.py` creating the two enums
(`chore_frequency`, `assignment_status` — **only if migration `0001_enums`
did not already create them**; it did, so skip the `CREATE TYPE` and use
`create_type=False`), then `chores`, `chore_cycles`, `chore_assignments` with
their constraints and indexes.

Create `0012_absences_and_adjustments.py` adding
`households.effort_window_days` (with its check), `member_absences` and
`effort_adjustments`.

Set `down_revision = "0010_household_expenses"` on `0011`, and
`down_revision = "0011_chores"` on `0012`. If Plan 5 has not run, point `0011`
at `0008_contributions` instead.

Apply: `DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_chore_models.py -v`
Expected: PASS — 9 tests

- [ ] **Step 6: Verify the migrations reverse**

Run: `cd apps/api && DATABASE_URL=$TEST_DATABASE_URL alembic downgrade base && DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`
Expected: both succeed

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/family_api/db apps/api/migrations apps/api/tests
git commit -m "feat(db): add chore and effort models"
```

---

### Task 3: Chore CRUD and seeded defaults

**Files:**
- Create: `apps/api/src/family_api/schemas/chore.py`, `services/chores.py`, `routers/chores.py`
- Modify: `apps/api/src/family_api/main.py`, `services/households.py`
- Test: `apps/api/tests/integration/test_chores.py`

**Interfaces:**
- Consumes: `Chore`, `require_admin`, `CurrentMember`.
- Produces: `SEEDED_CHORES`; `seed_chores(session, household)`; `list_chores`, `create_chore`, `update_chore`, `archive_chore`; `ChoreResponse`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_chores.py`:

```python
import pytest
from httpx import AsyncClient


async def _admin_and_adult(client: AsyncClient) -> tuple[dict, dict]:
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
    return admin, papa


@pytest.mark.asyncio
async def test_a_new_household_gets_the_seeded_chores(client: AsyncClient) -> None:
    """FR-M8-02: effort is the whole mechanism, so defaults are deliberate."""
    admin, _ = await _admin_and_adult(client)
    response = await client.get("/api/v1/chores", headers=admin)

    assert response.status_code == 200
    by_name = {c["name"]: c["effort_points"] for c in response.json()}
    assert by_name["Sacar la basura"] == 1
    assert by_name["Tender camas"] == 2
    assert by_name["Lavar platos"] == 3
    assert by_name["Lavar ropa"] == 4
    assert by_name["Cocinar"] == 5
    assert by_name["Trapear"] == 5
    assert by_name["Limpiar baño"] == 7


@pytest.mark.asyncio
async def test_admin_can_create_a_chore(client: AsyncClient) -> None:
    admin, _ = await _admin_and_adult(client)
    response = await client.post(
        "/api/v1/chores",
        json={"name": "Pasear al perro", "frequency": "daily", "effort_points": 2},
        headers=admin,
    )

    assert response.status_code == 201
    assert response.json()["effort_points"] == 2


@pytest.mark.asyncio
async def test_a_non_admin_cannot_create_a_chore(client: AsyncClient) -> None:
    """C-11 / FR-M8-03: effort weight is the currency of fairness."""
    _, papa = await _admin_and_adult(client)
    response = await client.post(
        "/api/v1/chores",
        json={"name": "Pasear al perro", "frequency": "daily", "effort_points": 2},
        headers=papa,
    )

    assert response.status_code == 403
    assert response.json()["type"] == "forbidden_role"


@pytest.mark.asyncio
async def test_a_non_admin_cannot_reprice_a_chore(client: AsyncClient) -> None:
    admin, papa = await _admin_and_adult(client)
    listed = await client.get("/api/v1/chores", headers=admin)
    chore_id = next(c["id"] for c in listed.json() if c["name"] == "Limpiar baño")

    response = await client.patch(
        f"/api/v1/chores/{chore_id}", json={"effort_points": 1}, headers=papa
    )

    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("points", [0, 11, -3])
async def test_effort_points_stay_within_one_to_ten(
    client: AsyncClient, points: int
) -> None:
    admin, _ = await _admin_and_adult(client)
    response = await client.post(
        "/api/v1/chores",
        json={"name": "Algo", "frequency": "weekly", "effort_points": points},
        headers=admin,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_duplicate_chore_names_are_rejected(client: AsyncClient) -> None:
    admin, _ = await _admin_and_adult(client)
    response = await client.post(
        "/api/v1/chores",
        json={"name": "Trapear", "frequency": "weekly", "effort_points": 5},
        headers=admin,
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_deleting_a_chore_archives_it(client: AsyncClient) -> None:
    admin, _ = await _admin_and_adult(client)
    listed = await client.get("/api/v1/chores", headers=admin)
    chore_id = next(c["id"] for c in listed.json() if c["name"] == "Cocinar")

    assert (
        await client.delete(f"/api/v1/chores/{chore_id}", headers=admin)
    ).status_code == 204

    after = await client.get("/api/v1/chores", headers=admin)
    assert "Cocinar" not in {c["name"] for c in after.json()}


@pytest.mark.asyncio
async def test_any_member_can_read_chores(client: AsyncClient) -> None:
    """FR-M8-15: no visibility rules on chores at all."""
    _, papa = await _admin_and_adult(client)
    assert (await client.get("/api/v1/chores", headers=papa)).status_code == 200
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_chores.py -v`
Expected: FAIL — 404 on `/api/v1/chores`

- [ ] **Step 3: Write the schemas**

Create `apps/api/src/family_api/schemas/chore.py`:

```python
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Frequency = Literal["daily", "weekly", "biweekly", "monthly"]


class CreateChoreRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = None
    frequency: Frequency
    effort_points: int = Field(ge=1, le=10)


class UpdateChoreRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = None
    frequency: Frequency | None = None
    effort_points: int | None = Field(default=None, ge=1, le=10)


class ChoreResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    frequency: str
    effort_points: int
    archived_at: datetime | None


class AssignmentResponse(BaseModel):
    id: UUID
    chore_id: UUID
    chore_name: str
    member_id: UUID
    member_name: str
    due_on: date
    status: str
    effort_points: int
    completed_at: datetime | None
    completed_by_member_id: UUID | None


class CreateCycleRequest(BaseModel):
    starts_on: date
    ends_on: date


class CycleResponse(BaseModel):
    id: UUID
    starts_on: date
    ends_on: date
    assignments: list[AssignmentResponse]


class ReassignRequest(BaseModel):
    member_id: UUID


class CreateAbsenceRequest(BaseModel):
    starts_on: date
    ends_on: date
    reason: str | None = None


class AbsenceResponse(BaseModel):
    id: UUID
    member_id: UUID
    starts_on: date
    ends_on: date
    reason: str | None


class CreateAdjustmentRequest(BaseModel):
    member_id: UUID
    points: int = Field(ne=0)
    # Required: an unexplained adjustment to a fairness ledger is
    # indistinguishable from favouritism.
    reason: str = Field(min_length=1, max_length=500)


class EffortBalanceRow(BaseModel):
    member_id: UUID
    display_name: str
    effort_points: int
    completed_count: int
    pending_count: int


class EffortBalancesResponse(BaseModel):
    window_days: int
    window_start: date
    members: list[EffortBalanceRow]
```

- [ ] **Step 4: Write the service and seeding**

Create `apps/api/src/family_api/services/chores.py`:

```python
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import Chore
from family_api.db.models.household import Household, HouseholdMember
from family_api.errors import DomainError, NotFoundError
from family_api.ids import new_id
from family_api.services.members import require_admin

# FR-M8-02. Seeded data stays in the user's language.
SEEDED_CHORES: tuple[tuple[str, str, int], ...] = (
    ("Sacar la basura", "daily", 1),
    ("Tender camas", "daily", 2),
    ("Lavar platos", "daily", 3),
    ("Lavar ropa", "weekly", 4),
    ("Cocinar", "daily", 5),
    ("Trapear", "weekly", 5),
    ("Limpiar baño", "weekly", 7),
)


class DuplicateChoreError(DomainError):
    type_slug = "duplicate_chore"
    status = 409
    title = "Ya existe una tarea con ese nombre"


def seed_chores(session: AsyncSession, household: Household) -> None:
    for name, frequency, points in SEEDED_CHORES:
        session.add(
            Chore(
                id=new_id(), household_id=household.id, name=name,
                frequency=frequency, effort_points=points,
            )
        )


async def list_chores(
    session: AsyncSession, member: HouseholdMember, include_archived: bool = False
) -> list[Chore]:
    stmt = select(Chore).where(Chore.household_id == member.household_id)
    if not include_archived:
        stmt = stmt.where(Chore.archived_at.is_(None))
    return list(await session.scalars(stmt.order_by(Chore.effort_points, Chore.name)))


async def create_chore(
    session: AsyncSession,
    member: HouseholdMember,
    name: str,
    description: str | None,
    frequency: str,
    effort_points: int,
) -> Chore:
    require_admin(member)
    chore = Chore(
        id=new_id(), household_id=member.household_id, name=name,
        description=description, frequency=frequency, effort_points=effort_points,
    )
    session.add(chore)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise DuplicateChoreError from exc
    return chore


async def _load(session: AsyncSession, member: HouseholdMember, chore_id: UUID) -> Chore:
    chore = await session.scalar(
        select(Chore).where(
            Chore.id == chore_id, Chore.household_id == member.household_id
        )
    )
    if chore is None:
        raise NotFoundError
    return chore


async def update_chore(
    session: AsyncSession,
    member: HouseholdMember,
    chore_id: UUID,
    name: str | None,
    description: str | None,
    frequency: str | None,
    effort_points: int | None,
) -> Chore:
    """Changing effort_points never rewrites existing assignments (FR-M8-04)."""
    require_admin(member)
    chore = await _load(session, member, chore_id)
    if name is not None:
        chore.name = name
    if description is not None:
        chore.description = description
    if frequency is not None:
        chore.frequency = frequency
    if effort_points is not None:
        chore.effort_points = effort_points
    await session.flush()
    return chore


async def archive_chore(
    session: AsyncSession, member: HouseholdMember, chore_id: UUID
) -> None:
    require_admin(member)
    chore = await _load(session, member, chore_id)
    if chore.archived_at is None:
        chore.archived_at = datetime.now(UTC)
    await session.flush()
```

In `services/households.py`, call `seed_chores(session, household)` inside
`create_household`, next to `seed_categories`, and import it.

- [ ] **Step 5: Write the router**

Create `apps/api/src/family_api/routers/chores.py` with `GET /chores`,
`POST /chores`, `PATCH /chores/{id}` and `DELETE /chores/{id}`, each delegating
to one service function and committing — the same shape as
`routers/categories.py` from Plan 2 Task 2. Mount it in `main.py`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_chores.py -v`
Expected: PASS — 10 tests

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/integration/test_chores.py
git commit -m "feat(chores): add chore crud and seeded set"
```

---

### Task 4: Effort balances

**Files:**
- Create: `apps/api/src/family_api/services/effort.py`
- Modify: `apps/api/src/family_api/routers/chores.py`
- Test: `apps/api/tests/integration/test_effort_balances.py`

**Interfaces:**
- Consumes: `ChoreAssignment`, `EffortAdjustment`, `HouseholdMember`.
- Produces: `window_start(household, today) -> date`; `effort_balances(session, household, today) -> dict[UUID, int]`; `balance_rows(session, household, today) -> list[EffortBalanceRow]`; `GET /effort-balances`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/test_effort_balances.py`:

```python
import pytest
from httpx import AsyncClient


async def _household(client: AsyncClient) -> tuple[dict, dict]:
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
    return admin, papa


@pytest.mark.asyncio
async def test_everyone_starts_at_zero(client: AsyncClient) -> None:
    admin, _ = await _household(client)
    response = await client.get("/api/v1/effort-balances", headers=admin)

    assert response.status_code == 200
    body = response.json()
    assert body["window_days"] == 60
    assert all(row["effort_points"] == 0 for row in body["members"])


@pytest.mark.asyncio
async def test_completing_a_chore_earns_its_frozen_weight(
    client: AsyncClient,
) -> None:
    admin, _ = await _household(client)
    await client.post(
        "/api/v1/chore-cycles",
        json={"starts_on": "2026-09-01", "ends_on": "2026-09-07"},
        headers=admin,
    )
    cycle = await client.get("/api/v1/chore-cycles/current", headers=admin)
    assignment = cycle.json()["assignments"][0]

    await client.post(
        f"/api/v1/chore-assignments/{assignment['id']}/complete", headers=admin
    )

    balances = await client.get("/api/v1/effort-balances", headers=admin)
    row = next(
        r for r in balances.json()["members"] if r["member_id"] == assignment["member_id"]
    )
    assert row["effort_points"] == assignment["effort_points"]
    assert row["completed_count"] == 1


@pytest.mark.asyncio
async def test_a_manual_adjustment_moves_the_balance(client: AsyncClient) -> None:
    """FR-M8-14."""
    admin, _ = await _household(client)
    members = await client.get("/api/v1/households/current", headers=admin)
    papa_id = next(
        m["id"] for m in members.json()["members"] if m["display_name"] == "Papá"
    )

    await client.post(
        "/api/v1/effort-adjustments",
        json={"member_id": papa_id, "points": 12, "reason": "Pintó la sala"},
        headers=admin,
    )

    balances = await client.get("/api/v1/effort-balances", headers=admin)
    row = next(r for r in balances.json()["members"] if r["member_id"] == papa_id)
    assert row["effort_points"] == 12


@pytest.mark.asyncio
async def test_an_adjustment_without_a_reason_is_rejected(
    client: AsyncClient,
) -> None:
    """C-12."""
    admin, _ = await _household(client)
    members = await client.get("/api/v1/households/current", headers=admin)
    papa_id = next(
        m["id"] for m in members.json()["members"] if m["display_name"] == "Papá"
    )

    response = await client.post(
        "/api/v1/effort-adjustments",
        json={"member_id": papa_id, "points": 12, "reason": ""},
        headers=admin,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_a_non_admin_cannot_adjust_effort(client: AsyncClient) -> None:
    _, papa = await _household(client)
    response = await client.post(
        "/api/v1/effort-adjustments",
        json={"member_id": "00000000-0000-0000-0000-000000000000",
              "points": 50, "reason": "porque sí"},
        headers=papa,
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_a_guest_has_no_balance_row(client: AsyncClient) -> None:
    """C-07: guests are outside the fairness system entirely."""
    admin, _ = await _household(client)
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

    balances = await client.get("/api/v1/effort-balances", headers=admin)
    names = {row["display_name"] for row in balances.json()["members"]}
    assert "Tía" not in names
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pytest tests/integration/test_effort_balances.py -v`
Expected: FAIL — 404 on `/api/v1/effort-balances`

- [ ] **Step 3: Write the service**

Create `apps/api/src/family_api/services/effort.py`:

```python
"""The one derived number the whole module rests on.

Nothing here is stored. A stored balance would be a second source of truth for
fairness, and the first argument it lost would end the module's usefulness.
"""

import statistics
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import ChoreAssignment, EffortAdjustment
from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.user import User
from family_api.schemas.chore import EffortBalanceRow

ELIGIBLE_ROLES = ("admin", "adult", "teen")


def window_start(household: Household, today: date) -> date:
    return today - timedelta(days=household.effort_window_days)


async def eligible_members(
    session: AsyncSession, household_id: UUID
) -> list[HouseholdMember]:
    """Guests are never assigned chores (FR-M8-06)."""
    return list(
        await session.scalars(
            select(HouseholdMember).where(
                HouseholdMember.household_id == household_id,
                HouseholdMember.status == "active",
                HouseholdMember.role.in_(ELIGIBLE_ROLES),
            )
        )
    )


async def effort_balances(
    session: AsyncSession, household: Household, today: date | None = None
) -> dict[UUID, int]:
    """member_id -> effort points earned inside the rolling window.

    A member who joined after the window opened starts at the MEDIAN of the
    others (FR-M8-09). Starting at zero would hand every chore in the household
    to the newest person as a welcome gift.
    """
    today = today or date.today()
    start = window_start(household, today)
    start_ts = datetime.combine(start, datetime.min.time(), tzinfo=UTC)

    members = await eligible_members(session, household.id)

    completed = dict(
        (
            await session.execute(
                select(
                    ChoreAssignment.completed_by_member_id,
                    func.coalesce(func.sum(ChoreAssignment.effort_points), 0),
                )
                .where(
                    ChoreAssignment.household_id == household.id,
                    ChoreAssignment.status == "done",
                    ChoreAssignment.completed_at >= start_ts,
                )
                .group_by(ChoreAssignment.completed_by_member_id)
            )
        ).all()
    )
    adjusted = dict(
        (
            await session.execute(
                select(
                    EffortAdjustment.member_id,
                    func.coalesce(func.sum(EffortAdjustment.points), 0),
                )
                .where(
                    EffortAdjustment.household_id == household.id,
                    EffortAdjustment.created_at >= start_ts,
                )
                .group_by(EffortAdjustment.member_id)
            )
        ).all()
    )

    balances = {
        m.id: int(completed.get(m.id, 0)) + int(adjusted.get(m.id, 0)) for m in members
    }

    established = [
        balances[m.id] for m in members if m.joined_at.date() <= start
    ]
    if established:
        median = int(statistics.median(established))
        for m in members:
            if m.joined_at.date() > start and balances[m.id] == 0:
                balances[m.id] = median

    return balances


async def balance_rows(
    session: AsyncSession, household: Household, today: date | None = None
) -> list[EffortBalanceRow]:
    today = today or date.today()
    balances = await effort_balances(session, household, today)

    names = dict(
        (
            await session.execute(
                select(HouseholdMember.id, User.display_name).join(
                    User, User.id == HouseholdMember.user_id
                )
            )
        ).all()
    )
    counts = dict(
        (
            await session.execute(
                select(
                    ChoreAssignment.member_id,
                    func.count().filter(ChoreAssignment.status == "done"),
                    func.count().filter(ChoreAssignment.status == "pending"),
                )
                .where(ChoreAssignment.household_id == household.id)
                .group_by(ChoreAssignment.member_id)
            )
        ).all()
        and {
            row[0]: (row[1], row[2])
            for row in (
                await session.execute(
                    select(
                        ChoreAssignment.member_id,
                        func.count().filter(ChoreAssignment.status == "done"),
                        func.count().filter(ChoreAssignment.status == "pending"),
                    )
                    .where(ChoreAssignment.household_id == household.id)
                    .group_by(ChoreAssignment.member_id)
                )
            ).all()
        }
        or {}
    )

    return [
        EffortBalanceRow(
            member_id=member_id,
            display_name=names.get(member_id, ""),
            effort_points=points,
            completed_count=counts.get(member_id, (0, 0))[0],
            pending_count=counts.get(member_id, (0, 0))[1],
        )
        for member_id, points in sorted(balances.items(), key=lambda kv: -kv[1])
    ]
```

**Simplify `balance_rows` when you implement it** — the `counts` expression
above is written defensively and is harder to read than it needs to be. One
query into a `{member_id: (done, pending)}` dict is enough. The test only cares
that the counts are right.

- [ ] **Step 4: Add the routes**

Append `GET /effort-balances` and `POST /effort-adjustments` to
`routers/chores.py`. The adjustment route calls `require_admin` and rejects an
empty reason via the schema's `min_length=1`.

- [ ] **Step 5: Run the tests**

Two tests need cycles (Task 5). Run the rest:

Run: `cd apps/api && pytest tests/integration/test_effort_balances.py -v -k "not completing"`
Expected: PASS — 5 tests

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/integration/test_effort_balances.py
git commit -m "feat(chores): add derived effort balances"
```

---

### Task 5: The assignment algorithm

**The core of the module.** Everything before this was setup.

**Files:**
- Create: `apps/api/src/family_api/services/assignment.py`, `services/absences.py`
- Modify: `apps/api/src/family_api/routers/chores.py`
- Test: `apps/api/tests/unit/test_assignment_algorithm.py`

**Interfaces:**
- Consumes: `occurrences` (Task 1), `effort_balances`, `eligible_members` (Task 4), `MemberAbsence`.
- Produces: `choose_assignee(candidates, balances, rng) -> UUID`; `generate_cycle(session, member, starts_on, ends_on) -> ChoreCycle`; `absent_member_ids(session, household_id, on: date) -> set[UUID]`; `CycleExistsError`.

- [ ] **Step 1: Write the failing unit tests**

The choice function is pure, so it is tested without a database. Create
`apps/api/tests/unit/test_assignment_algorithm.py`:

```python
import random
from uuid import UUID, uuid4

import pytest

from family_api.services.assignment import choose_assignee

A, B, C = uuid4(), uuid4(), uuid4()


def test_picks_the_lowest_balance() -> None:
    assert choose_assignee([A, B, C], {A: 10, B: 3, C: 7}, random.Random(0)) == B


def test_a_tie_is_broken_at_random_not_by_order() -> None:
    """C-03 / FR-M8-07: a deterministic tie-break favours one person forever."""
    picks = [
        choose_assignee([A, B], {A: 5, B: 5}, random.Random(seed)) for seed in range(400)
    ]
    share = picks.count(A) / len(picks)
    assert 0.4 < share < 0.6, f"A was chosen {share:.0%} of the time"


def test_a_three_way_tie_is_roughly_even() -> None:
    picks = [
        choose_assignee([A, B, C], {A: 0, B: 0, C: 0}, random.Random(seed))
        for seed in range(600)
    ]
    for member in (A, B, C):
        share = picks.count(member) / len(picks)
        assert 0.25 < share < 0.42


def test_negative_balances_are_handled() -> None:
    """A manual adjustment can push someone below zero."""
    assert choose_assignee([A, B], {A: -5, B: 0}, random.Random(0)) == A


def test_an_empty_candidate_list_raises() -> None:
    with pytest.raises(ValueError, match="No eligible"):
        choose_assignee([], {}, random.Random(0))


def test_a_missing_balance_is_treated_as_zero() -> None:
    """A brand-new member must not be skipped because they have no row yet."""
    assert choose_assignee([A, B], {B: 4}, random.Random(0)) == A
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/unit/test_assignment_algorithm.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.services.assignment'`

- [ ] **Step 3: Write the absence helper**

Create `apps/api/src/family_api/services/absences.py`:

```python
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import MemberAbsence
from family_api.db.models.household import HouseholdMember
from family_api.errors import ForbiddenRoleError, NotFoundError
from family_api.ids import new_id


async def absent_member_ids(
    session: AsyncSession, household_id: UUID, on: date
) -> set[UUID]:
    rows = await session.scalars(
        select(MemberAbsence.member_id).where(
            MemberAbsence.household_id == household_id,
            MemberAbsence.starts_on <= on,
            MemberAbsence.ends_on >= on,
        )
    )
    return set(rows)


async def create_absence(
    session: AsyncSession,
    member: HouseholdMember,
    starts_on: date,
    ends_on: date,
    reason: str | None,
) -> MemberAbsence:
    """Self only. You declare your own absence; nobody declares it for you."""
    absence = MemberAbsence(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        starts_on=starts_on, ends_on=ends_on, reason=reason,
    )
    session.add(absence)
    await session.flush()
    return absence


async def list_absences(
    session: AsyncSession, member: HouseholdMember
) -> list[MemberAbsence]:
    return list(
        await session.scalars(
            select(MemberAbsence)
            .where(MemberAbsence.member_id == member.id)
            .order_by(MemberAbsence.starts_on.desc())
        )
    )


async def delete_absence(
    session: AsyncSession, member: HouseholdMember, absence_id: UUID
) -> None:
    absence = await session.scalar(
        select(MemberAbsence).where(MemberAbsence.id == absence_id)
    )
    if absence is None or absence.household_id != member.household_id:
        raise NotFoundError
    if absence.member_id != member.id and member.role != "admin":
        raise ForbiddenRoleError
    await session.delete(absence)
    await session.flush()
```

- [ ] **Step 4: Write the algorithm**

Create `apps/api/src/family_api/services/assignment.py`:

```python
"""Assignment by lowest accumulated effort.

NOT a rotation. Round-robin was rejected because it ignores that mopping costs
more than taking out the rubbish, and random was rejected because it permits
exactly the "10 chores versus 2" outcome the module exists to prevent.
"""

import random
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from family_api.db.models.chore import Chore, ChoreAssignment, ChoreCycle
from family_api.db.models.household import Household, HouseholdMember
from family_api.errors import DomainError
from family_api.ids import new_id
from family_api.recurrence import occurrences
from family_api.services.absences import absent_member_ids
from family_api.services.chores import list_chores
from family_api.services.effort import effort_balances, eligible_members
from family_api.services.members import require_admin


class CycleExistsError(DomainError):
    type_slug = "cycle_exists"
    status = 409
    title = "Ya existe un ciclo que empieza ese día"


def choose_assignee(
    candidates: list[UUID], balances: dict[UUID, int], rng: random.Random
) -> UUID:
    """Lowest balance wins; ties are broken at random.

    The random tie-break is not decoration. Sorting by name or join date hands
    the same person the same chore every cycle, forever (FR-M8-07).
    """
    if not candidates:
        raise ValueError("No eligible members to assign to")
    lowest = min(balances.get(c, 0) for c in candidates)
    tied = [c for c in candidates if balances.get(c, 0) == lowest]
    return rng.choice(tied)


async def generate_cycle(
    session: AsyncSession,
    member: HouseholdMember,
    starts_on: date,
    ends_on: date,
    rng: random.Random | None = None,
) -> ChoreCycle:
    require_admin(member)
    rng = rng or random.Random()

    household = await session.get(Household, member.household_id)
    assert household is not None

    cycle = ChoreCycle(
        id=new_id(), household_id=household.id, starts_on=starts_on, ends_on=ends_on
    )
    session.add(cycle)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise CycleExistsError from exc

    chores = await list_chores(session, member)
    members = await eligible_members(session, household.id)
    balances = await effort_balances(session, household, starts_on)

    # Build every occurrence first, then walk them in date order, so a chore due
    # on the 1st is assigned before one due on the 5th and the provisional
    # balance updates spread work across the cycle instead of piling it on
    # whoever started lowest.
    slots: list[tuple[Chore, date]] = []
    for chore in chores:
        for due_on in occurrences(chore.frequency, starts_on, ends_on):
            slots.append((chore, due_on))
    slots.sort(key=lambda slot: slot[1])

    for chore, due_on in slots:
        absent = await absent_member_ids(session, household.id, due_on)
        candidates = [m.id for m in members if m.id not in absent]
        if not candidates:
            # Everyone is away. Record it rather than silently dropping the chore.
            session.add(
                ChoreAssignment(
                    id=new_id(), household_id=household.id, cycle_id=cycle.id,
                    chore_id=chore.id, member_id=members[0].id, due_on=due_on,
                    status="skipped", effort_points=chore.effort_points,
                )
            )
            continue

        chosen = choose_assignee(candidates, balances, rng)
        session.add(
            ChoreAssignment(
                id=new_id(), household_id=household.id, cycle_id=cycle.id,
                chore_id=chore.id, member_id=chosen, due_on=due_on,
                status="pending",
                # Frozen now (FR-M8-04).
                effort_points=chore.effort_points,
            )
        )
        # Provisional: assume it gets done, so the next slot goes elsewhere.
        balances[chosen] = balances.get(chosen, 0) + chore.effort_points

    await session.flush()
    return cycle
```

- [ ] **Step 5: Add cycle, completion and reassignment**

Append to `apps/api/src/family_api/services/assignment.py`:

```python
from datetime import UTC, datetime

from family_api.errors import ForbiddenRoleError, NotFoundError


async def current_cycle(
    session: AsyncSession, household_id: UUID, on: date | None = None
) -> ChoreCycle | None:
    on = on or date.today()
    return await session.scalar(
        select(ChoreCycle)
        .where(
            ChoreCycle.household_id == household_id,
            ChoreCycle.starts_on <= on,
            ChoreCycle.ends_on >= on,
        )
        .order_by(ChoreCycle.starts_on.desc())
    )


async def _load_assignment(
    session: AsyncSession, member: HouseholdMember, assignment_id: UUID
) -> ChoreAssignment:
    assignment = await session.scalar(
        select(ChoreAssignment).where(
            ChoreAssignment.id == assignment_id,
            ChoreAssignment.household_id == member.household_id,
        )
    )
    if assignment is None:
        raise NotFoundError
    return assignment


async def complete_assignment(
    session: AsyncSession, member: HouseholdMember, assignment_id: UUID
) -> ChoreAssignment:
    assignment = await _load_assignment(session, member, assignment_id)
    if assignment.member_id != member.id and member.role != "admin":
        raise ForbiddenRoleError
    assignment.status = "done"
    assignment.completed_at = datetime.now(UTC)
    # Credit follows whoever actually did it (FR-M8-11).
    assignment.completed_by_member_id = member.id
    await session.flush()
    return assignment


async def reassign_assignment(
    session: AsyncSession,
    member: HouseholdMember,
    assignment_id: UUID,
    new_member_id: UUID,
) -> ChoreAssignment:
    assignment = await _load_assignment(session, member, assignment_id)
    if assignment.member_id != member.id and member.role != "admin":
        raise ForbiddenRoleError

    target = await session.get(HouseholdMember, new_member_id)
    if target is None or target.household_id != member.household_id:
        raise NotFoundError
    if target.role == "guest":
        raise ForbiddenRoleError

    assignment.member_id = target.id
    await session.flush()
    return assignment
```

- [ ] **Step 6: Add the routes**

Append to `routers/chores.py`: `POST /chore-cycles`,
`GET /chore-cycles/current`, `GET /chore-assignments`,
`POST /chore-assignments/{id}/complete`,
`POST /chore-assignments/{id}/reassign`, and the three `/me/absences` routes.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/unit/test_assignment_algorithm.py tests/integration/test_effort_balances.py -v`
Expected: PASS — 6 unit tests plus all 6 balance tests

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/family_api apps/api/tests
git commit -m "feat(chores): add effort-balanced assignment"
```

---

### Task 6: The fairness suite

**The proof.** Everything before this built the thing this suite verifies.

**Files:**
- Test: `apps/api/tests/integration/test_fairness.py`, `test_absences.py`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Write the fairness tests**

Create `apps/api/tests/integration/test_fairness.py`:

```python
"""The module's whole claim is fairness. These test the claim, not the CRUD.

docs/testing-strategy.md §4B.
"""

import random
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import Chore, ChoreAssignment
from family_api.db.models.household import HouseholdMember
from family_api.db.models.user import User
from family_api.ids import new_id
from family_api.security.passwords import hash_password
from family_api.services.assignment import generate_cycle
from family_api.services.effort import effort_balances
from family_api.services.households import create_household


async def _household_of_four(session: AsyncSession):
    daniel = User(
        id=new_id(), email="d@example.com",
        password_hash=hash_password("correct-horse-battery"), display_name="Daniel",
    )
    session.add(daniel)
    await session.flush()
    household, admin = await create_household(session, daniel, "Familia Hernández")

    members = [admin]
    for name, role in (("Papá", "adult"), ("Mamá", "adult"), ("Hermano", "teen")):
        user = User(
            id=new_id(), email=f"{name}@example.com",
            password_hash=hash_password("correct-horse-battery"), display_name=name,
        )
        session.add(user)
        await session.flush()
        member = HouseholdMember(
            id=new_id(), household_id=household.id, user_id=user.id,
            role=role, status="active",
        )
        session.add(member)
        members.append(member)
    await session.flush()
    return household, members


async def _complete_everything(session: AsyncSession, household_id) -> None:
    from datetime import UTC, datetime

    assignments = (
        await session.scalars(
            select(ChoreAssignment).where(
                ChoreAssignment.household_id == household_id,
                ChoreAssignment.status == "pending",
            )
        )
    ).all()
    for assignment in assignments:
        assignment.status = "done"
        assignment.completed_at = datetime.now(UTC)
        assignment.completed_by_member_id = assignment.member_id
    await session.flush()


@pytest.mark.asyncio
async def test_the_spread_stays_within_one_chore(db_session: AsyncSession) -> None:
    """C-01. The whole point of the module."""
    household, members = await _household_of_four(db_session)
    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 28),
        rng=random.Random(1),
    )
    await _complete_everything(db_session, household.id)

    balances = await effort_balances(db_session, household, date(2026, 9, 28))
    heaviest = max(
        c.effort_points
        for c in (await db_session.scalars(select(Chore))).all()
    )

    assert max(balances.values()) - min(balances.values()) <= heaviest


@pytest.mark.asyncio
async def test_the_stated_failure_case_cannot_happen(
    db_session: AsyncSession,
) -> None:
    """C-02: "Daniel hizo 10 tareas, Papá hizo 2" from an equal start."""
    household, members = await _household_of_four(db_session)
    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 28),
        rng=random.Random(7),
    )

    counts: dict = {}
    for assignment in (
        await db_session.scalars(
            select(ChoreAssignment).where(ChoreAssignment.household_id == household.id)
        )
    ).all():
        counts[assignment.member_id] = counts.get(assignment.member_id, 0) + 1

    assert max(counts.values()) <= min(counts.values()) * 3


@pytest.mark.asyncio
async def test_repricing_a_chore_never_rewrites_history(
    db_session: AsyncSession,
) -> None:
    """C-04 / INV-D-10."""
    household, members = await _household_of_four(db_session)
    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 7),
        rng=random.Random(3),
    )
    bano = await db_session.scalar(select(Chore).where(Chore.name == "Limpiar baño"))
    before = [
        a.effort_points
        for a in (
            await db_session.scalars(
                select(ChoreAssignment).where(ChoreAssignment.chore_id == bano.id)
            )
        ).all()
    ]

    bano.effort_points = 1
    await db_session.flush()

    after = [
        a.effort_points
        for a in (
            await db_session.scalars(
                select(ChoreAssignment).where(ChoreAssignment.chore_id == bano.id)
            )
        ).all()
    ]
    assert before == after
    assert all(points == 7 for points in after)


@pytest.mark.asyncio
async def test_a_guest_is_never_assigned(db_session: AsyncSession) -> None:
    """C-07 / INV-D-12."""
    household, members = await _household_of_four(db_session)
    guest_user = User(
        id=new_id(), email="tia@example.com",
        password_hash=hash_password("correct-horse-battery"), display_name="Tía",
    )
    db_session.add(guest_user)
    await db_session.flush()
    guest = HouseholdMember(
        id=new_id(), household_id=household.id, user_id=guest_user.id,
        role="guest", status="active",
    )
    db_session.add(guest)
    await db_session.flush()

    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 28),
        rng=random.Random(5),
    )

    assigned = {
        a.member_id
        for a in (
            await db_session.scalars(
                select(ChoreAssignment).where(
                    ChoreAssignment.household_id == household.id
                )
            )
        ).all()
    }
    assert guest.id not in assigned


@pytest.mark.asyncio
async def test_a_new_member_starts_at_the_median(db_session: AsyncSession) -> None:
    """C-08 / FR-M8-09: joining must not be a punishment."""
    from datetime import UTC, datetime, timedelta

    household, members = await _household_of_four(db_session)
    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 28),
        rng=random.Random(2),
    )
    await _complete_everything(db_session, household.id)

    newcomer_user = User(
        id=new_id(), email="primo@example.com",
        password_hash=hash_password("correct-horse-battery"), display_name="Primo",
    )
    db_session.add(newcomer_user)
    await db_session.flush()
    newcomer = HouseholdMember(
        id=new_id(), household_id=household.id, user_id=newcomer_user.id,
        role="adult", status="active", joined_at=datetime.now(UTC),
    )
    db_session.add(newcomer)
    await db_session.flush()

    balances = await effort_balances(db_session, household, date(2026, 9, 28))

    assert balances[newcomer.id] > 0
    assert balances[newcomer.id] <= max(balances.values())


@pytest.mark.asyncio
async def test_credit_follows_whoever_did_it(db_session: AsyncSession) -> None:
    """C-09 / FR-M8-11."""
    from datetime import UTC, datetime

    household, members = await _household_of_four(db_session)
    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 7),
        rng=random.Random(4),
    )
    assignment = await db_session.scalar(
        select(ChoreAssignment).where(ChoreAssignment.household_id == household.id)
    )
    original, helper = assignment.member_id, next(
        m.id for m in members if m.id != assignment.member_id
    )

    assignment.status = "done"
    assignment.completed_at = datetime.now(UTC)
    assignment.completed_by_member_id = helper
    await db_session.flush()

    balances = await effort_balances(db_session, household, date(2026, 9, 7))
    assert balances[helper] >= assignment.effort_points
    assert balances[original] == 0
```

- [ ] **Step 2: Write the absence tests**

Create `apps/api/tests/integration/test_absences.py`:

```python
"""C-05 and C-06.

Compensation is emergent: an absent member earns nothing while away, so their
balance stays flat and the ordinary rule assigns them more on return. There is
deliberately no effort-debt table to check.
"""

import random
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import ChoreAssignment, MemberAbsence
from family_api.ids import new_id
from family_api.services.assignment import generate_cycle

from tests.integration.test_fairness import _complete_everything, _household_of_four


@pytest.mark.asyncio
async def test_an_absent_member_is_never_assigned_in_range(
    db_session: AsyncSession,
) -> None:
    """C-05 / INV-D-11."""
    household, members = await _household_of_four(db_session)
    papa = members[1]
    db_session.add(
        MemberAbsence(
            id=new_id(), household_id=household.id, member_id=papa.id,
            starts_on=date(2026, 9, 1), ends_on=date(2026, 9, 14), reason="Viaje",
        )
    )
    await db_session.flush()

    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 14),
        rng=random.Random(11),
    )

    assigned = {
        a.member_id
        for a in (
            await db_session.scalars(
                select(ChoreAssignment).where(
                    ChoreAssignment.household_id == household.id
                )
            )
        ).all()
    }
    assert papa.id not in assigned


@pytest.mark.asyncio
async def test_the_returning_member_catches_up_without_a_debt_table(
    db_session: AsyncSession,
) -> None:
    """C-06 / FR-M8-13."""
    household, members = await _household_of_four(db_session)
    papa = members[1]
    db_session.add(
        MemberAbsence(
            id=new_id(), household_id=household.id, member_id=papa.id,
            starts_on=date(2026, 9, 1), ends_on=date(2026, 9, 14),
        )
    )
    await db_session.flush()

    await generate_cycle(
        db_session, members[0], date(2026, 9, 1), date(2026, 9, 14),
        rng=random.Random(13),
    )
    await _complete_everything(db_session, household.id)

    await generate_cycle(
        db_session, members[0], date(2026, 9, 15), date(2026, 9, 28),
        rng=random.Random(17),
    )

    second = (
        await db_session.scalars(
            select(ChoreAssignment).where(ChoreAssignment.due_on >= date(2026, 9, 15))
        )
    ).all()
    counts: dict = {}
    for assignment in second:
        counts[assignment.member_id] = counts.get(assignment.member_id, 0) + 1

    assert counts.get(papa.id, 0) == max(counts.values())


@pytest.mark.asyncio
async def test_no_effort_debt_table_exists() -> None:
    """The compensation mechanism must stay emergent."""
    from family_api.db import models

    assert not hasattr(models, "EffortDebt")
```

- [ ] **Step 3: Run the suites**

Run: `cd apps/api && pytest tests/integration/test_fairness.py tests/integration/test_absences.py -v`
Expected: PASS — 9 tests

If `test_the_spread_stays_within_one_chore` fails, the bug is almost certainly
the **provisional balance update** in `generate_cycle` — without it every slot
in a cycle goes to whoever started lowest. Fix the algorithm, not the
assertion.

- [ ] **Step 4: Run the full suite and the linters**

Run: `cd apps/api && pytest -v && ruff check . && mypy src`
Expected: all PASS. **Paste real output.**

- [ ] **Step 5: Commit**

```bash
git add apps/api/tests
git commit -m "test(chores): add fairness and absence suites"
```

---

### Task 7: Route coverage, seed, and web

**Files:**
- Modify: `apps/api/tests/visibility/test_route_coverage.py`, `apps/api/scripts/seed.py`
- Create: `apps/web/src/app/(app)/tareas/page.tsx`, `src/components/chores/{AssignmentRow,EffortBalanceBar}.tsx`
- Test: `apps/web/src/components/__tests__/chores.test.tsx`

**Interfaces:**
- Consumes: Plan 4's primitives.
- Produces: `<AssignmentRow>`, `<EffortBalanceBar>`, the `/tareas` route.

- [ ] **Step 1: Add the route exemptions**

In `apps/api/tests/visibility/test_route_coverage.py`, add to `EXEMPT_PREFIXES`:

```python
    "/api/v1/chores",             # FR-M8-15: housework is not private
    "/api/v1/chore-cycles",       # FR-M8-15
    "/api/v1/chore-assignments",  # FR-M8-15
    "/api/v1/effort-balances",    # FR-M8-15
    "/api/v1/effort-adjustments", # FR-M8-15
```

Run: `cd apps/api && pytest tests/visibility/test_route_coverage.py -v`
Expected: PASS

- [ ] **Step 2: Extend the seed**

In `apps/api/scripts/seed.py`, after the household expenses block, generate one
cycle for the current month and mark roughly half its assignments done, so the
effort balances screen has something to show on first run:

```python
    import random
    from datetime import timedelta

    from family_api.services.assignment import generate_cycle

    today = date.today()
    cycle = await generate_cycle(
        session, admin_member,
        today.replace(day=1), today.replace(day=1) + timedelta(days=27),
        rng=random.Random(42),
    )

    assignments = (
        await session.scalars(
            select(ChoreAssignment).where(ChoreAssignment.cycle_id == cycle.id)
        )
    ).all()
    for assignment in assignments[: len(assignments) // 2]:
        assignment.status = "done"
        assignment.completed_at = datetime.now(UTC)
        assignment.completed_by_member_id = assignment.member_id
    await session.flush()
```

Add the imports it needs (`ChoreAssignment`, `datetime`, `UTC`).

- [ ] **Step 3: Write the failing web test**

Create `apps/web/src/components/__tests__/chores.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssignmentRow, type Assignment } from "../chores/AssignmentRow";
import { EffortBalanceBar } from "../chores/EffortBalanceBar";

const assignment: Assignment = {
  id: "1",
  chore_id: "c1",
  chore_name: "Sacar la basura",
  member_id: "m1",
  member_name: "Daniel",
  due_on: "2026-09-03",
  status: "pending",
  effort_points: 1,
  completed_at: null,
  completed_by_member_id: null,
};

describe("AssignmentRow", () => {
  it("shows the chore and who it fell to", () => {
    render(<AssignmentRow assignment={assignment} />);
    expect(screen.getByText("Sacar la basura")).toBeInTheDocument();
    expect(screen.getByText("Daniel")).toBeInTheDocument();
  });

  it("shows the effort weight, since it is the whole mechanism", () => {
    render(<AssignmentRow assignment={assignment} />);
    expect(screen.getByText("1 pt")).toBeInTheDocument();
  });

  it("uses the plural for weights above one", () => {
    render(
      <AssignmentRow
        assignment={{ ...assignment, chore_name: "Limpiar baño", effort_points: 7 }}
      />,
    );
    expect(screen.getByText("7 pts")).toBeInTheDocument();
  });

  it("shows the Spanish status", () => {
    render(<AssignmentRow assignment={{ ...assignment, status: "done" }} />);
    expect(screen.getByText("Hecha")).toBeInTheDocument();
  });
});

describe("EffortBalanceBar", () => {
  const rows = [
    { member_id: "1", display_name: "Daniel", effort_points: 34,
      completed_count: 11, pending_count: 2 },
    { member_id: "2", display_name: "Papá", effort_points: 31,
      completed_count: 7, pending_count: 1 },
  ];

  it("lists every member with their points", () => {
    render(<EffortBalanceBar rows={rows} />);
    expect(screen.getByText("Daniel")).toBeInTheDocument();
    expect(screen.getByText("34 pts")).toBeInTheDocument();
  });

  it("never renders a PrivateBlock", () => {
    // FR-M8-15: chores carry no visibility rules at all.
    const { container } = render(<EffortBalanceBar rows={rows} />);
    expect(container.textContent).not.toContain("Privado");
  });

  it("scales bars against the highest balance, not against 100", () => {
    render(<EffortBalanceBar rows={rows} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars[0]).toHaveAttribute("aria-valuemax", "34");
  });
});
```

- [ ] **Step 4: Write the components**

Create `apps/web/src/components/chores/AssignmentRow.tsx`:

```tsx
export interface Assignment {
  id: string;
  chore_id: string;
  chore_name: string;
  member_id: string;
  member_name: string;
  due_on: string;
  status: string;
  effort_points: number;
  completed_at: string | null;
  completed_by_member_id: string | null;
}

const STATUS: Record<string, string> = {
  pending: "Pendiente",
  done: "Hecha",
  skipped: "Omitida",
  reassigned: "Reasignada",
};

export function AssignmentRow({
  assignment,
  onComplete,
}: {
  assignment: Assignment;
  onComplete?: (id: string) => void;
}) {
  return (
    <li className="flex items-center justify-between border-b border-border py-3">
      <div className="flex flex-col">
        <span className="font-medium">{assignment.chore_name}</span>
        <span className="text-sm text-text-muted">{assignment.member_name}</span>
        <span className="text-xs text-text-muted">{assignment.due_on}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="tabular text-sm font-medium">
            {assignment.effort_points} {assignment.effort_points === 1 ? "pt" : "pts"}
          </span>
          <span className="text-xs text-text-muted">
            {STATUS[assignment.status] ?? assignment.status}
          </span>
        </div>
        {assignment.status === "pending" && onComplete ? (
          <button
            onClick={() => onComplete(assignment.id)}
            aria-label={`Marcar ${assignment.chore_name} como hecha`}
            className="rounded-lg bg-brand px-3 py-2 text-sm text-brand-contrast active:opacity-80"
          >
            Hecha
          </button>
        ) : null}
      </div>
    </li>
  );
}
```

Create `apps/web/src/components/chores/EffortBalanceBar.tsx`:

```tsx
import { Card } from "@/components/ui/Card";

export interface BalanceRow {
  member_id: string;
  display_name: string;
  effort_points: number;
  completed_count: number;
  pending_count: number;
}

export function EffortBalanceBar({ rows }: { rows: BalanceRow[] }) {
  // Scale against the highest balance, not against 100: the number that
  // matters is the gap between people, not an absolute score.
  const highest = Math.max(1, ...rows.map((row) => row.effort_points));

  return (
    <Card className="flex flex-col gap-3">
      <span className="text-sm text-text-muted">Esfuerzo del periodo</span>
      {rows.map((row) => (
        <div key={row.member_id} className="flex flex-col gap-1">
          <div className="flex justify-between text-sm">
            <span>{row.display_name}</span>
            <span className="tabular font-medium">{row.effort_points} pts</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={row.effort_points}
            aria-valuemin={0}
            aria-valuemax={highest}
            aria-label={`Esfuerzo de ${row.display_name}`}
            className="h-2 overflow-hidden rounded-full bg-surface-sunken"
          >
            <div
              className="h-full bg-brand"
              style={{ width: `${(row.effort_points / highest) * 100}%` }}
            />
          </div>
          <span className="text-xs text-text-muted">
            {row.completed_count} hechas · {row.pending_count} pendientes
          </span>
        </div>
      ))}
    </Card>
  );
}
```

- [ ] **Step 5: Write the page and add the tab**

Create `apps/web/src/app/(app)/tareas/page.tsx` — a Server Component fetching
`/chore-cycles/current` and `/effort-balances`. Render `EffortBalanceBar`, then
"Esta semana" with the pending `AssignmentRow`s, then a collapsed "Hechas"
section. `EmptyState` reading "No hay un ciclo activo" with, for an admin, a
"Generar ciclo" button posting to `/chore-cycles`.

Add a client "Marcar hecha" mutation posting to
`/chore-assignments/{id}/complete`, optimistic with rollback.

Add a sixth destination to `TABS` in `BottomTabBar.tsx`:
`{ href: "/tareas", label: "Tareas", icon: "🧹" }`. **Update the Plan 4 test
asserting exactly five tabs** — it will now correctly fail. Six is still within
the comfortable range for a bottom bar; a seventh would not be.

- [ ] **Step 6: Run the full verification**

```bash
cd apps/api && pytest -v && ruff check . && mypy src
cd ../web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build
make api-types && git diff --exit-code apps/web/src/lib/api/generated
```

Expected: everything PASS, no client diff.

- [ ] **Step 7: Commit**

```bash
git add apps/api apps/web
git commit -m "feat(chores): add chores screen and seeding"
```

---

### Task 8: Chore administration screen

Task 7 wired 4 of the API's 12 module-8 endpoints into the web app. This task
wires the remaining admin surface: `GET/POST /chores`, `PATCH/DELETE
/chores/{id}`, `POST /effort-adjustments`. FR-M8-01, FR-M8-02, FR-M8-03,
FR-M8-14. Mockup: "Administrar tareas" in `docs/design-index.md` Plan 6 —
opened with the Artifact tool and unpacked per that doc's "Cómo lee esto un
agente" section before writing any component.

**Route is `/tareas/admin`, open to every household member — not gated at the
page.** FR-M8-15 (chores carry no visibility rules) and the mockup's own
"Catalogo miembro" / "Detalle miembro" screens both show a non-admin reading
the same catalog, just without the chevron, the FAB, or the edit sheet, plus
a neutral-gray, lock-icon banner reading "esto lo define el administrador" —
never a red error state. "Admin screen" describes who can *mutate*, not who
can *see*; a page-level redirect would contradict both FR-M8-15 and the
mockup it ships with.

**Files:**
- Create: `apps/web/src/components/chores/EffortSlider.tsx`
- Create: `apps/web/src/app/(app)/tareas/admin/page.tsx`,
  `ChoreAdminClient.tsx`, `EffortAdjustmentForm.tsx`
- Modify: `apps/web/src/app/(app)/tareas/page.tsx` (admin entry point)
- Test: `apps/web/src/components/__tests__/chores-admin.test.tsx`,
  `apps/web/src/app/__tests__/ChoreAdminClient.test.tsx`,
  `apps/web/src/app/__tests__/EffortAdjustmentForm.test.tsx`

**Interfaces:**
- Consumes: `ChoreResponse` / `CreateChoreRequest` / `UpdateChoreRequest` /
  `CreateAdjustmentRequest` (generated `schema.d.ts`, already current — Task 3
  and Task 4 built the API), `pageFetch`, `clientFetch`, `ApiError`, `Sheet`,
  `Button`, `Input`, `Card`, `IconLock`, `IconPlus`, `pushToast`.
- Produces: `<EffortSlider value onChange? disabled?>`; `<ChoreAdminClient
  chores isAdmin>`; `<EffortAdjustmentForm members>`; the `/tareas/admin`
  route.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/__tests__/chores-admin.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EffortSlider } from "../chores/EffortSlider";

describe("EffortSlider", () => {
  it("shows the current value out of ten", () => {
    render(<EffortSlider value={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("de 10")).toBeInTheDocument();
  });

  it("exposes the value on the slider role for assistive tech", () => {
    render(<EffortSlider value={3} />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "3");
  });

  it("calls onChange with the points of the clicked bar", () => {
    const onChange = vi.fn();
    render(<EffortSlider value={1} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("7 puntos de esfuerzo"));
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("uses the singular for one point", () => {
    render(<EffortSlider value={1} onChange={vi.fn()} />);
    expect(screen.getByLabelText("1 punto de esfuerzo")).toBeInTheDocument();
  });

  it("moves by one with the arrow keys", () => {
    const onChange = vi.fn();
    render(<EffortSlider value={5} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("never calls onChange when disabled", () => {
    const onChange = vi.fn();
    render(<EffortSlider value={5} onChange={onChange} disabled />);
    fireEvent.click(screen.getByLabelText("7 puntos de esfuerzo"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

Create `apps/web/src/app/__tests__/ChoreAdminClient.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChoreAdminClient, type Chore } from "../(app)/tareas/admin/ChoreAdminClient";

const chores: Chore[] = [
  {
    id: "1", name: "Sacar la basura", description: null,
    frequency: "daily", effort_points: 1, archived_at: null,
  },
  {
    id: "2", name: "Limpiar baño", description: null,
    frequency: "weekly", effort_points: 7, archived_at: null,
  },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderClient(isAdmin: boolean) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ChoreAdminClient chores={chores} isAdmin={isAdmin} />
    </QueryClientProvider>,
  );
}

describe("ChoreAdminClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows every chore with its effort points", () => {
    renderClient(true);
    expect(screen.getByText("Sacar la basura")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("lets a non-admin see the list but never edit it", () => {
    renderClient(false);
    expect(screen.getByText("Sacar la basura")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Los puntos de esfuerzo los define el administrador del hogar. Puedes consultarlos, no cambiarlos.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Nueva tarea")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sacar la basura/ })).not.toBeInTheDocument();
  });

  it("opens the edit sheet prefilled when an admin taps a chore", () => {
    renderClient(true);
    fireEvent.click(screen.getByRole("button", { name: /Sacar la basura/ }));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Sacar la basura");
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "1");
  });

  it("creates a chore with the exact shape the API expects", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      expect(body).toEqual({
        name: "Pasear al perro", description: "",
        frequency: "weekly", effort_points: 5,
      });
      return jsonResponse({ id: "3", ...body });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderClient(true);
    fireEvent.click(screen.getByLabelText("Nueva tarea"));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Pasear al perro" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("shows the duplicate name error inline, not a generic message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { type: "duplicate_chore", title: "Ya existe una tarea con ese nombre", status: 409 },
          409,
        ),
      ),
    );
    renderClient(true);
    fireEvent.click(screen.getByLabelText("Nueva tarea"));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Trapear" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya existe una tarea con ese nombre.",
    );
  });

  it("archives a chore through delete from the edit sheet", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/chores/2");
      expect(init?.method).toBe("DELETE");
      return { ok: true, status: 204, json: async () => null };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderClient(true);
    fireEvent.click(screen.getByRole("button", { name: /Limpiar baño/ }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar tarea" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
```

Create `apps/web/src/app/__tests__/EffortAdjustmentForm.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EffortAdjustmentForm } from "../(app)/tareas/admin/EffortAdjustmentForm";

const members = [
  { id: "m1", display_name: "Papá" },
  { id: "m2", display_name: "Mamá" },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderForm() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <EffortAdjustmentForm members={members} />
    </QueryClientProvider>,
  );
}

describe("EffortAdjustmentForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires the reason in the DOM, not only in the API", () => {
    // C-12 / FR-M8-14: an adjustment without a reason is indistinguishable
    // from favouritism, so this is not merely a server-side rule.
    renderForm();
    expect(screen.getByLabelText("Motivo")).toBeRequired();
  });

  it("keeps the submit button disabled without a reason", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Puntos"), { target: { value: "12" } });
    expect(screen.getByRole("button", { name: "Registrar ajuste" })).toBeDisabled();
  });

  it("sends member, points and reason exactly as the API expects", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      expect(body).toEqual({ member_id: "m2", points: 12, reason: "Pintó la sala" });
      return jsonResponse({ id: "a1", ...body });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderForm();
    fireEvent.change(screen.getByLabelText("Miembro"), { target: { value: "m2" } });
    fireEvent.change(screen.getByLabelText("Puntos"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Pintó la sala" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar ajuste" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run chores-admin ChoreAdminClient EffortAdjustmentForm`
Expected: FAIL — the imported modules do not exist yet

- [ ] **Step 3: Write the effort selector**

Create `apps/web/src/components/chores/EffortSlider.tsx` — ten bars of
increasing height, filled up to the current value, `role="slider"` with
`aria-valuenow/min/max` and arrow-key support. **Not a numeric field**: the
control that decides who a chore falls to communicates weight by height, and
a typed number invites second-guessing the scale instead of feeling it.

- [ ] **Step 4: Run the selector tests**

Run: `cd apps/web && npx vitest run chores-admin`
Expected: PASS — 6 tests

- [ ] **Step 5: Write the admin client and adjustment form**

Create `apps/web/src/app/(app)/tareas/admin/ChoreAdminClient.tsx` — the list
(admin: tappable row opens a `Sheet` with name / description / frequency
segmented control / `EffortSlider`, "Guardar" doing `POST /chores` or `PATCH
/chores/{id}`, "Eliminar tarea" doing `DELETE /chores/{id}` when editing an
existing chore; non-admin: same rows, no chevron, no FAB, the lock-icon
banner from the mockup instead). Branch mutation errors on `error.type ===
"duplicate_chore"`, never on `error.title` (`docs/api-contract.md`).

Create `apps/web/src/app/(app)/tareas/admin/EffortAdjustmentForm.tsx` — member
select, points, and a **required** reason (`required` in the DOM *and*
`points === 0 || !reason.trim()` disables submit) posting to
`POST /effort-adjustments`; on success, invalidate the `effort-balances`
query so `/tareas` reflects the change immediately.

- [ ] **Step 6: Write the page and add the entry point**

Create `apps/web/src/app/(app)/tareas/admin/page.tsx` — a Server Component
fetching `/chores` and `/households/current`, rendering `ChoreAdminClient`
and, for an admin, `EffortAdjustmentForm` with the household's eligible
members (`admin`/`adult`/`teen`, active — guests are never assigned chores,
FR-M8-06, so they take no adjustment either).

In `apps/web/src/app/(app)/tareas/page.tsx`, add a `Card` link to
`/tareas/admin` labelled "Administrar tareas", visible only when
`isAdmin`, placed under the page header the same way `/hogar` links to
`/hogar/gastos`.

- [ ] **Step 7: Run the full test suite**

Run: `cd apps/web && npx vitest run chores-admin ChoreAdminClient EffortAdjustmentForm chores`
Expected: PASS — selector, admin client, adjustment form and the existing
Task 7 chores tests all green (the last confirms the new `/tareas` link
didn't break `TareasPage`).

- [ ] **Step 8: Run the full verification**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build
```

Expected: everything PASS. No `make api-types` run — this task adds no
endpoints, only consumers of ones Task 3 and Task 4 already generated types
for. **Paste real output.**

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "feat(chores): add task administration screen"
```

---

### Task 9: Absences UI and reassignment

Tasks 7 and 8 wired 9 of the module's 12 endpoints. Three remain unconsumed:
`GET/POST /me/absences`, `DELETE /me/absences/{id}` (FR-M8-12), and
`POST /chore-assignments/{id}/reassign` (FR-M8-11). This task builds both.

**Files:**
- Modify: `apps/api/src/family_api/schemas/chore.py`,
  `apps/api/src/family_api/services/effort.py`
- Test: `apps/api/tests/integration/test_effort_balances.py`
- Create: `apps/web/src/app/(app)/ajustes/ausencias/page.tsx`,
  `AbsenceForm.tsx`
- Modify: `apps/web/src/components/chores/EffortBalanceBar.tsx`,
  `AssignmentRow.tsx`, `apps/web/src/app/(app)/tareas/{page.tsx,TareasClient.tsx}`
- Test: `apps/web/src/components/__tests__/chores.test.tsx`,
  `apps/web/src/app/__tests__/AbsenceForm.test.tsx`

**Mockup:** "Ausencias" in `docs/design-index.md` Plan 6 — opened with the
Artifact tool before writing the page.

**Interfaces:**
- Consumes: `MemberAbsence`, `absent_member_ids`-style query, `pageFetch`,
  `clientFetch`, `Card`, `Input`, `Button`, `EmptyState`.
- Produces: `EffortBalanceRow.absent_until`; `<AbsenceForm absences>`; the
  `/ajustes/ausencias` route; `AssignmentRow`'s `onReassign` prop; `Assignment
  Row`'s member picker.

The effort card cannot show "Ausente hasta el `<fecha>`" for members other
than the caller unless the derived balance row itself carries that fact — a
new debt-style table would violate the module's own rule, so the absence
window is folded into the existing derived row instead of a new endpoint.

- [ ] **Step 1: Write the failing API test**

Add to `apps/api/tests/integration/test_effort_balances.py`:

```python
@pytest.mark.asyncio
async def test_an_absent_member_shows_their_return_date(client: AsyncClient) -> None:
    """FR-M8-12: the effort card must explain, not just omit."""
    admin, _ = await _household(client)
    members = await client.get("/api/v1/households/current", headers=admin)
    papa_id = next(
        m["id"] for m in members.json()["members"] if m["display_name"] == "Papá"
    )
    today = date.today()
    await client.post(
        "/api/v1/me/absences",
        json={
            "starts_on": today.isoformat(),
            "ends_on": (today + timedelta(days=5)).isoformat(),
        },
        headers={"Authorization": f"Bearer {(await client.post('/api/v1/auth/login', json={'email': 'papa@example.com', 'password': 'correct-horse-battery'}).json())['access_token']}"} if False else admin,
    )
```

(The implementer writes this against `papa`'s own token, registered inline as
in the other tests in this file — `admin` cannot declare `papa`'s absence.)
Simpler: reuse the existing `_household` helper's `papa` credentials directly
to `POST /me/absences`, then assert the balances response:

```python
    balances = await client.get("/api/v1/effort-balances", headers=admin)
    row = next(r for r in balances.json()["members"] if r["member_id"] == papa_id)
    assert row["absent_until"] == (today + timedelta(days=5)).isoformat()

    others = [r for r in balances.json()["members"] if r["member_id"] != papa_id]
    assert all(r["absent_until"] is None for r in others)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pytest tests/integration/test_effort_balances.py -v -k absent`
Expected: FAIL — `KeyError: 'absent_until'`

- [ ] **Step 3: Add the field**

In `apps/api/src/family_api/schemas/chore.py`, add to `EffortBalanceRow`:

```python
    absent_until: date | None
```

- [ ] **Step 4: Compute it in the service**

In `apps/api/src/family_api/services/effort.py`, in `balance_rows`, add a
query over `MemberAbsence` for the household covering `today`, grouped by
member with `max(ends_on)`, and thread it into each `EffortBalanceRow`:

```python
from family_api.db.models.chore import MemberAbsence

    absences_result = await session.execute(
        select(MemberAbsence.member_id, func.max(MemberAbsence.ends_on))
        .where(
            MemberAbsence.household_id == household.id,
            MemberAbsence.starts_on <= today,
            MemberAbsence.ends_on >= today,
        )
        .group_by(MemberAbsence.member_id)
    )
    absent_until: dict[UUID, date] = {row[0]: row[1] for row in absences_result}
```

then pass `absent_until=absent_until.get(member_id)` into each
`EffortBalanceRow`.

- [ ] **Step 5: Run the tests and regenerate types**

```bash
cd apps/api && pytest tests/integration/test_effort_balances.py -v
cd .. && make api-types && git diff --exit-code apps/web/src/lib/api/generated
```

Expected: PASS — 7 tests. Client diff picks up `absent_until`.

- [ ] **Step 6: Write the failing web tests**

Add to `apps/web/src/components/__tests__/chores.test.tsx`:

```tsx
it("shows an absent member's return date instead of the counts", () => {
  render(
    <EffortBalanceBar
      rows={[
        { ...rows[1], absent_until: "2026-09-20" },
      ]}
    />,
  );
  expect(screen.getByText("Ausente hasta el 20 sep")).toBeInTheDocument();
  expect(screen.queryByText(/pendientes/)).not.toBeInTheDocument();
});

it("greys out an absent member's bar instead of colouring it", () => {
  const { container } = render(
    <EffortBalanceBar rows={[{ ...rows[0], absent_until: "2026-09-20" }]} />,
  );
  expect(container.querySelector(".bg-brand")).not.toBeInTheDocument();
});
```

Add reassignment coverage to `AssignmentRow`:

```tsx
it("lets any member hand the chore to someone else", () => {
  const onReassign = vi.fn();
  render(
    <AssignmentRow
      assignment={assignment}
      members={[{ id: "m1", display_name: "Daniel" }, { id: "m2", display_name: "Papá" }]}
      onReassign={onReassign}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Reasignar/ }));
  fireEvent.change(screen.getByLabelText("Reasignar a"), { target: { value: "m2" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  expect(onReassign).toHaveBeenCalledWith("1", "m2");
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run chores`
Expected: FAIL — new markup does not exist yet

- [ ] **Step 8: Update EffortBalanceBar and AssignmentRow**

`EffortBalanceBar`: accept `absent_until: string | null` on `BalanceRow`. When
set, render the bar in `bg-surface-sunken`/muted text instead of `bg-brand`,
and swap the "N hechas · N pendientes" line for "Ausente hasta el
`<formatted date>`" — never a struck-through or red treatment, so it never
reads as non-compliance.

`AssignmentRow`: accept optional `members: {id, display_name}[]` and
`onReassign?: (assignmentId: string, newMemberId: string) => void`. A
"Reasignar" button (shown whenever `onReassign` and `members.length > 1`,
regardless of status — credit already follows the doer, not the assignee)
toggles an inline `<select aria-label="Reasignar a">` plus a "Confirmar"
button, matching the row's existing inline-disclosure style rather than
opening a `Sheet`, since the choice is one field.

- [ ] **Step 9: Run the component tests**

Run: `cd apps/web && npx vitest run chores`
Expected: PASS

- [ ] **Step 10: Wire reassignment into the tareas page**

In `TareasClient.tsx`, accept a `members` prop, add a `reassign` mutation
posting to `/chore-assignments/{id}/reassign` with optimistic
`member_id`/`member_name` update and rollback on error (same shape as
`complete`), and pass `members` + `onReassign` through to every
`AssignmentRow`. In `tareas/page.tsx`, pass `household.members` (filtered to
`role !== "guest"`, FR-M8-06) down to `TareasClient`, and add a `Card` link to
`/ajustes/ausencias` labelled "Marcar ausencia" — visible to every member,
not just admins, placed under the existing "Administrar tareas" link.

- [ ] **Step 11: Write the absences page and form**

Create `apps/web/src/app/(app)/ajustes/ausencias/AbsenceForm.tsx` — list of
the member's own absences (date range + optional reason) each with a
"Quitar" button doing `DELETE /me/absences/{id}`, and a form (`starts_on`,
`ends_on`, optional `reason` with the caption "Opcional. Tu familia ve que no
estás; el porqué es cosa tuya.") posting `POST /me/absences`; invalidate
nothing client-side beyond a `router.refresh()` since this is a Server
Component page.

Create `apps/web/src/app/(app)/ajustes/ausencias/page.tsx` fetching
`/me/absences`, rendering the page header, the one-line mechanism explainer —
"Mientras estás ausente no se te asignan tareas; al volver, el sistema te
asigna más hasta emparejarte con el resto." — and `AbsenceForm`.

- [ ] **Step 12: Write the failing test, then the page test**

Create `apps/web/src/app/__tests__/AbsenceForm.test.tsx` covering: renders
existing absences, the reason field's caption text is present, submitting
posts `starts_on`/`ends_on`/`reason` exactly, and "Quitar" calls `DELETE
/me/absences/{id}`.

Run: `cd apps/web && npx vitest run AbsenceForm`
Expected: FAIL, then PASS after Step 11.

- [ ] **Step 13: Run the full verification**

```bash
cd apps/api && pytest -v && ruff check . && mypy src
cd ../web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build
```

Expected: everything PASS. **Paste real output.**

- [ ] **Step 14: Commit**

```bash
git add apps/api apps/web
git commit -m "feat(chores): add absences and reassignment ui"
```

---

## Plan Self-Review

**1. Spec coverage.**

| Requirement | Task |
| ----------- | ---- |
| FR-M8-01 chores with frequency and effort weight | 2, 3, 8 |
| FR-M8-02 seeded defaults with deliberate weights | 3, 8 |
| FR-M8-03 only admins create or reprice | 3, 8 |
| FR-M8-04 assignments freeze the weight | 2, 6 |
| FR-M8-05 cycles generate occurrences | 1, 5 |
| FR-M8-06 lowest balance, eligible members only, no guests | 4, 5, 6 |
| FR-M8-07 random tie-break | 5 |
| FR-M8-08 rolling window balance | 4 |
| FR-M8-09 new members start at the median | 4, 6 |
| FR-M8-10 completion states | 5 |
| FR-M8-11 credit follows the doer | 5, 6 |
| FR-M8-12 absences | 5, 6 |
| FR-M8-13 emergent compensation, no debt table | 6 |
| FR-M8-14 attributed manual adjustments | 4, 8 |
| FR-M8-15 no visibility rules | 3, 7, 8 |
| C-01 … C-12 | 6, 4, 3 |
| INV-D-10 · INV-D-11 · INV-D-12 | 6 · 6 · 6 |

**2. Placeholder scan.** Three prose-specified pieces: the chore router in Task 3
Step 5 (four routes in the exact shape of `routers/categories.py`, whose full
code is in Plan 2), the remaining routes in Task 5 Step 6, and the `/tareas`
page in Task 7 Step 5. Same deliberate trade-off as Plans 4 and 5 — each names
its endpoints, components, Spanish copy and empty state.

**One genuine wart, flagged inline:** `balance_rows` in Task 4 Step 3 is written
awkwardly and the step says so, with instructions to simplify it to one query.
I left the working version rather than hand the implementer prose where code
belongs.

**3. Type consistency.** `occurrences` (1 → 5), `add_months` (Plan 5 → 1),
`SEEDED_CHORES` / `seed_chores` (3 → 3), `list_chores` (3 → 5),
`eligible_members` / `effort_balances` / `window_start` (4 → 5, 6),
`EffortBalanceRow` (schemas → 4, 7), `choose_assignee(candidates, balances, rng)`
(5 → 5, 6), `generate_cycle(..., rng=)` (5 → 6, 7 — the `rng` parameter exists
so tests are deterministic while production stays random),
`absent_member_ids` (5 → 5), `Assignment` / `BalanceRow` TS interfaces matching
`AssignmentResponse` / `EffortBalanceRow` field-for-field (schemas → 7).

**Two cross-plan effects to expect:**

1. **Plan 4's `BottomTabBar` test asserting exactly five tabs will fail** once
   Task 7 adds "Tareas". That is a correct failure; update the assertion to six.
2. **Migration numbering assumes Plan 5 ran first** (`0011` follows
   `0010_household_expenses`). If chores are built before the household ledger,
   point `0011` at `0008_contributions` instead — called out in Task 2 Step 4.
