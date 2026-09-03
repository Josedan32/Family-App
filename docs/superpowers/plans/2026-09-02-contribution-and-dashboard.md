# Contribution & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Module 4 (household contribution — monthly targets, per-member pledges, and contributions that atomically mirror into the contributor's personal ledger) and the Phase 1 dashboard, which is the first screen that reads through the visibility model.

**Architecture:** Same four layers. The defining piece of work is **INV-D-01**: recording a contribution writes two rows — the contribution and the contributor's personal expense — in one database transaction, linked by foreign key. Either both exist or neither does. The dashboard composes household aggregates (computed from *all* members) with per-member cards resolved individually through the Plan 2 resolver.

**Tech Stack:** Unchanged.

**Spec:** `docs/superpowers/specs/2026-09-02-family-hub-design.md`

**Depends on:** Plan 1 (`2026-09-02-foundation-and-household.md`) and Plan 2 (`2026-09-02-personal-finance-and-transparency.md`). Complete both first.

**Also read before starting:** `docs/visibility-rules.md` **§5 and §6** — this plan implements both override cases and the derivability disclosure. Then `docs/api-contract.md` §8, §10.

---

## Global Constraints

All constraints from Plans 1 and 2 still apply. The ones this plan turns on most:

- **Money is `BIGINT` minor units + currency code. Never `float`.** COP has 0 minor units.
- **All amounts strictly positive.** Direction lives in a kind column.
- **Code English, UI Spanish (`es-CO`).** Translate through `docs/glossary.md` — an *aporte* is a `contribution`, never a `payment` or a `quota`.
- **No role grants visibility.** Admin sets the household target; it reads nothing extra.
- **Contribution amounts are always visible to every household member** (FR-M4-07), overriding personal settings. **The expense a contribution generates is a normal transaction** and resolves against the member's `expenses` setting like any other (`visibility-rules.md` §5.2). Same fact, two surfaces, two rules — do not "simplify" this.
- **Household totals include every member, private ones included** (FR-D1-02). Do not exclude private members to "fix" the derivability leak — that breaks the dashboard and creates a *new* leak, because a total that shifts when someone changes a setting reveals that they changed it.
- **A private module on a dashboard card carries `level` and no figure** — not `null`, not `0`.
- **Denials return a uniform `403 not_visible`.**
- **Log lines never contain amounts or notes.**
- **Tests run against real PostgreSQL 16.**
- **Commits:** `<type>(<scope>): <subject>`, imperative, ≤ 50 chars, no period.

### Interfaces inherited from Plans 1 and 2

Verify before starting; adapt and note if a signature differs.

```python
family_api.ids.new_id() -> UUID
family_api.errors.{DomainError, NotFoundError, ForbiddenRoleError, NotVisibleError}
family_api.periods.{parse_period, month_bounds, current_period}
family_api.db.models.household.{Household, HouseholdMember}
family_api.db.models.seeded.{Category, VisibilitySetting}
family_api.db.models.transaction.Transaction   # .source .source_id
family_api.services.members.{CurrentMember, require_admin, derive_age}
family_api.services.households.CONTRIBUTION_CATEGORY    # "Aporte al hogar"
family_api.services.transactions.total_for(session, member_id, kind, start, end) -> int
family_api.services.savings.total_balance(session, member_id) -> int
family_api.services.debts.total_outstanding(session, member_id) -> int
family_api.services.visibility.{Level, resolve, visibility_for, VisibilityScope, MODULES}
family_api.schemas.visibility.DISCLOSURES
```

---

## File Structure

```
apps/api/
├── migrations/versions/0008_contributions.py
├── src/family_api/
│   ├── db/models/contribution.py    # ContributionPeriod, ContributionPledge, Contribution
│   ├── schemas/
│   │   ├── contribution.py
│   │   └── dashboard.py
│   ├── services/
│   │   ├── contributions.py         # THE atomic mirror write (INV-D-01)
│   │   └── dashboard.py
│   └── routers/
│       ├── contributions.py
│       └── dashboard.py
└── tests/
    ├── integration/{test_contribution_periods,test_contributions,test_mirror_atomicity}.py
    └── visibility/{test_dashboard_visibility,test_contribution_visibility}.py
```

---

### Task 1: Contribution models and migration

**Files:**
- Create: `apps/api/src/family_api/db/models/contribution.py`, `apps/api/migrations/versions/0008_contributions.py`
- Modify: `apps/api/src/family_api/db/models/__init__.py`
- Test: `apps/api/tests/integration/test_contribution_models.py`

**Interfaces:**
- Consumes: `Base`, `TimestampMixin`, `Household`, `HouseholdMember`, `Transaction`.
- Produces: `ContributionPeriod(id, household_id, period_month, goal_amount_minor, status)`; `ContributionPledge(id, household_id, period_id, member_id, expected_amount_minor)`; `Contribution(id, household_id, period_id, member_id, amount_minor, paid_on, note, expense_transaction_id)`.

Column definitions come from `docs/data-model.md` §7.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_contribution_models.py`:

```python
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.contribution import ContributionPeriod
from family_api.db.models.household import Household
from family_api.ids import new_id


async def _household(session: AsyncSession, user_id) -> Household:
    household = Household(
        id=new_id(), name="Hogar", currency="COP",
        timezone="America/Bogota", created_by=user_id,
    )
    session.add(household)
    await session.flush()
    return household


@pytest.mark.asyncio
async def test_period_month_must_be_the_first_of_the_month(
    db_session: AsyncSession, make_user
) -> None:
    from datetime import date

    user = await make_user()
    household = await _household(db_session, user.id)

    db_session.add(
        ContributionPeriod(
            id=new_id(), household_id=household.id,
            period_month=date(2026, 9, 15), goal_amount_minor=2_000_000,
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_only_one_period_per_household_per_month(
    db_session: AsyncSession, make_user
) -> None:
    """FR-M4-01."""
    from datetime import date

    user = await make_user()
    household = await _household(db_session, user.id)

    for _ in range(2):
        db_session.add(
            ContributionPeriod(
                id=new_id(), household_id=household.id,
                period_month=date(2026, 9, 1), goal_amount_minor=2_000_000,
            )
        )
    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_contribution_requires_a_linked_expense_transaction() -> None:
    """INV-D-01: the FK is NOT NULL, so an unmirrored contribution is impossible."""
    from family_api.db.models.contribution import Contribution

    column = Contribution.__table__.columns["expense_transaction_id"]
    assert column.nullable is False
    assert column.unique is True
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_contribution_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.db.models.contribution'`

- [ ] **Step 3: Write the models**

Create `apps/api/src/family_api/db/models/contribution.py`:

```python
from datetime import date
from uuid import UUID

from sqlalchemy import (
    BigInteger, CheckConstraint, Date, ForeignKey, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

period_status = PgEnum("open", "closed", name="period_status", create_type=False)


class ContributionPeriod(Base, TimestampMixin):
    __tablename__ = "contribution_periods"
    __table_args__ = (
        UniqueConstraint("household_id", "period_month", name="uq_period_household_month"),
        CheckConstraint("goal_amount_minor > 0", name="ck_period_goal_positive"),
        CheckConstraint(
            "EXTRACT(DAY FROM period_month) = 1", name="ck_period_month_is_first"
        ),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    period_month: Mapped[date] = mapped_column(Date, nullable=False)
    goal_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(period_status, nullable=False, server_default="open")


class ContributionPledge(Base, TimestampMixin):
    __tablename__ = "contribution_pledges"
    __table_args__ = (
        UniqueConstraint("period_id", "member_id", name="uq_pledge_period_member"),
        CheckConstraint("expected_amount_minor > 0", name="ck_pledge_positive"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    period_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("contribution_periods.id", ondelete="CASCADE"),
        nullable=False,
    )
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="CASCADE"),
        nullable=False,
    )
    expected_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)


class Contribution(Base, TimestampMixin):
    """Money a member puts into the shared household pot.

    `expense_transaction_id` is NOT NULL and UNIQUE: a contribution cannot
    exist without its mirrored personal expense, and no two contributions can
    claim the same one (INV-D-01, FR-M4-05).

    ON DELETE RESTRICT means the transaction cannot be removed out from under
    the contribution — deletion must go through the service, which removes
    both in the correct order inside one transaction.
    """

    __tablename__ = "contributions"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_contribution_positive"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    period_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("contribution_periods.id", ondelete="RESTRICT"),
        nullable=False,
    )
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    expense_transaction_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
```

Register all three in `db/models/__init__.py`.

- [ ] **Step 4: Generate and correct the migration**

Run: `cd apps/api && alembic revision --autogenerate -m "contributions"`

Rename to `0008_contributions.py`, `down_revision = "0007_member_loans"`. Remove any enum creation for `period_status` — it exists from `0001_enums`. Verify the `EXTRACT(DAY FROM period_month) = 1` check survives autogeneration; add it by hand if not.

Apply: `DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_contribution_models.py -v`
Expected: PASS — 3 tests

- [ ] **Step 6: Verify the migration reverses**

Run: `cd apps/api && DATABASE_URL=$TEST_DATABASE_URL alembic downgrade base && DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`
Expected: both succeed

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/family_api/db apps/api/migrations apps/api/tests/integration/test_contribution_models.py
git commit -m "feat(db): add contribution period models"
```

---

### Task 2: Period management and pledges

**Files:**
- Create: `apps/api/src/family_api/schemas/contribution.py`, `apps/api/src/family_api/services/contributions.py`, `apps/api/src/family_api/routers/contributions.py`
- Modify: `apps/api/src/family_api/main.py`
- Test: `apps/api/tests/integration/test_contribution_periods.py`

**Interfaces:**
- Consumes: models (Task 1), `require_admin`, `CurrentMember`, `current_period`.
- Produces: `open_period(session, member, period_month, goal_amount_minor) -> ContributionPeriod`; `list_periods(session, member, status) -> list[ContributionPeriod]`; `get_open_period(session, household_id) -> ContributionPeriod | None`; `update_period(...)`; `close_period(...)`; `set_pledges(session, member, period_id, pledges) -> None`; `PeriodClosedError`, `PeriodExistsError`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_contribution_periods.py`:

```python
import pytest
from httpx import AsyncClient


async def _admin_and_papa(client: AsyncClient) -> tuple[dict, dict, str]:
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
    listed = await client.get("/api/v1/households/current", headers=admin)
    papa_id = next(
        m["id"] for m in listed.json()["members"] if m["display_name"] == "Papá"
    )
    return admin, papa, papa_id


PERIOD = {"period_month": "2026-09-01", "goal_amount_minor": 2_000_000}


@pytest.mark.asyncio
async def test_admin_can_open_a_period(client: AsyncClient) -> None:
    admin, _, _ = await _admin_and_papa(client)
    response = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=admin
    )

    assert response.status_code == 201
    body = response.json()
    assert body["goal_amount_minor"] == 2_000_000
    assert body["status"] == "open"


@pytest.mark.asyncio
async def test_non_admin_cannot_open_a_period(client: AsyncClient) -> None:
    """FR-M4-01: setting the household target is an admin capability."""
    _, papa, _ = await _admin_and_papa(client)
    response = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=papa
    )

    assert response.status_code == 403
    assert response.json()["type"] == "forbidden_role"


@pytest.mark.asyncio
async def test_a_second_period_in_the_same_month_is_rejected(
    client: AsyncClient,
) -> None:
    admin, _, _ = await _admin_and_papa(client)
    await client.post("/api/v1/contribution-periods", json=PERIOD, headers=admin)
    response = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=admin
    )

    assert response.status_code == 409
    assert response.json()["type"] == "period_exists"


@pytest.mark.asyncio
async def test_admin_can_set_pledges(client: AsyncClient) -> None:
    """FR-M4-02."""
    admin, _, papa_id = await _admin_and_papa(client)
    created = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=admin
    )
    period_id = created.json()["id"]

    response = await client.put(
        f"/api/v1/contribution-periods/{period_id}/pledges",
        json={"pledges": [{"member_id": papa_id, "expected_amount_minor": 1_000_000}]},
        headers=admin,
    )

    assert response.status_code == 200
    current = await client.get("/api/v1/contribution-periods/current", headers=admin)
    papa = next(m for m in current.json()["members"] if m["member_id"] == papa_id)
    assert papa["pledged_minor"] == 1_000_000


@pytest.mark.asyncio
async def test_setting_pledges_replaces_the_previous_set(client: AsyncClient) -> None:
    admin, _, papa_id = await _admin_and_papa(client)
    created = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=admin
    )
    period_id = created.json()["id"]

    for amount in (1_000_000, 600_000):
        await client.put(
            f"/api/v1/contribution-periods/{period_id}/pledges",
            json={"pledges": [{"member_id": papa_id, "expected_amount_minor": amount}]},
            headers=admin,
        )

    current = await client.get("/api/v1/contribution-periods/current", headers=admin)
    papa = next(m for m in current.json()["members"] if m["member_id"] == papa_id)
    assert papa["pledged_minor"] == 600_000


@pytest.mark.asyncio
async def test_a_closed_period_rejects_target_changes(client: AsyncClient) -> None:
    """FR-M4-08."""
    admin, _, _ = await _admin_and_papa(client)
    created = await client.post(
        "/api/v1/contribution-periods", json=PERIOD, headers=admin
    )
    period_id = created.json()["id"]
    await client.post(
        f"/api/v1/contribution-periods/{period_id}/close", headers=admin
    )

    response = await client.patch(
        f"/api/v1/contribution-periods/{period_id}",
        json={"goal_amount_minor": 3_000_000},
        headers=admin,
    )

    assert response.status_code == 409
    assert response.json()["type"] == "period_closed"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_contribution_periods.py -v`
Expected: FAIL — 404 on `/api/v1/contribution-periods`

- [ ] **Step 3: Write the schemas**

Create `apps/api/src/family_api/schemas/contribution.py`:

```python
from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field


class CreatePeriodRequest(BaseModel):
    period_month: date
    goal_amount_minor: int = Field(gt=0)


class UpdatePeriodRequest(BaseModel):
    goal_amount_minor: int | None = Field(default=None, gt=0)


class PledgeItem(BaseModel):
    member_id: UUID
    expected_amount_minor: int = Field(gt=0)


class SetPledgesRequest(BaseModel):
    pledges: list[PledgeItem]


class CreateContributionRequest(BaseModel):
    amount_minor: int = Field(gt=0)
    paid_on: date
    note: str | None = None


class PeriodResponse(BaseModel):
    id: UUID
    period_month: date
    goal_amount_minor: int
    status: str
    currency: str


class PeriodMemberRow(BaseModel):
    member_id: UUID
    display_name: str
    pledged_minor: int
    contributed_minor: int


class PeriodDetailResponse(BaseModel):
    """Always visible to every household member (FR-M4-07).

    The household pot is shared money, and FR-M4-04 is unbuildable if members
    can hide their share.
    """

    id: UUID
    period_month: date
    status: str
    goal_amount_minor: int
    collected_minor: int
    progress: float
    currency: str
    members: list[PeriodMemberRow]


class ContributionResponse(BaseModel):
    id: UUID
    member_id: UUID
    amount_minor: int
    currency: str
    paid_on: date
    note: str | None
    expense_transaction_id: UUID
```

- [ ] **Step 4: Write the period service**

Create `apps/api/src/family_api/services/contributions.py`:

```python
from datetime import date
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.contribution import (
    Contribution, ContributionPeriod, ContributionPledge,
)
from family_api.db.models.household import HouseholdMember
from family_api.errors import DomainError, NotFoundError
from family_api.ids import new_id
from family_api.services.members import require_admin


class PeriodClosedError(DomainError):
    type_slug = "period_closed"
    status = 409
    title = "El periodo está cerrado"


class PeriodExistsError(DomainError):
    type_slug = "period_exists"
    status = 409
    title = "Ya existe un periodo para ese mes"


async def open_period(
    session: AsyncSession,
    member: HouseholdMember,
    period_month: date,
    goal_amount_minor: int,
) -> ContributionPeriod:
    require_admin(member)
    period = ContributionPeriod(
        id=new_id(), household_id=member.household_id,
        period_month=period_month.replace(day=1),
        goal_amount_minor=goal_amount_minor, status="open",
    )
    session.add(period)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise PeriodExistsError from exc
    return period


async def list_periods(
    session: AsyncSession, member: HouseholdMember, status: str | None = None
) -> list[ContributionPeriod]:
    stmt = select(ContributionPeriod).where(
        ContributionPeriod.household_id == member.household_id
    )
    if status is not None:
        stmt = stmt.where(ContributionPeriod.status == status)
    return list(
        await session.scalars(stmt.order_by(ContributionPeriod.period_month.desc()))
    )


async def get_open_period(
    session: AsyncSession, household_id: UUID
) -> ContributionPeriod | None:
    return await session.scalar(
        select(ContributionPeriod)
        .where(
            ContributionPeriod.household_id == household_id,
            ContributionPeriod.status == "open",
        )
        .order_by(ContributionPeriod.period_month.desc())
    )


async def _load_period(
    session: AsyncSession, member: HouseholdMember, period_id: UUID
) -> ContributionPeriod:
    period = await session.scalar(
        select(ContributionPeriod).where(
            ContributionPeriod.id == period_id,
            ContributionPeriod.household_id == member.household_id,
        )
    )
    if period is None:
        raise NotFoundError
    return period


async def update_period(
    session: AsyncSession,
    member: HouseholdMember,
    period_id: UUID,
    goal_amount_minor: int | None,
) -> ContributionPeriod:
    require_admin(member)
    period = await _load_period(session, member, period_id)
    if period.status == "closed":
        raise PeriodClosedError
    if goal_amount_minor is not None:
        period.goal_amount_minor = goal_amount_minor
    await session.flush()
    return period


async def close_period(
    session: AsyncSession, member: HouseholdMember, period_id: UUID
) -> ContributionPeriod:
    require_admin(member)
    period = await _load_period(session, member, period_id)
    period.status = "closed"
    await session.flush()
    return period


async def set_pledges(
    session: AsyncSession,
    member: HouseholdMember,
    period_id: UUID,
    pledges: list[tuple[UUID, int]],
) -> None:
    """Replaces the whole set. A PUT of an empty list clears all pledges."""
    require_admin(member)
    period = await _load_period(session, member, period_id)
    if period.status == "closed":
        raise PeriodClosedError

    await session.execute(
        delete(ContributionPledge).where(ContributionPledge.period_id == period.id)
    )
    for member_id, expected in pledges:
        session.add(
            ContributionPledge(
                id=new_id(), household_id=period.household_id, period_id=period.id,
                member_id=member_id, expected_amount_minor=expected,
            )
        )
    await session.flush()


async def period_totals(
    session: AsyncSession, period_id: UUID
) -> tuple[int, dict[UUID, int], dict[UUID, int]]:
    """Returns (collected, contributed_by_member, pledged_by_member)."""
    collected = await session.scalar(
        select(func.coalesce(func.sum(Contribution.amount_minor), 0)).where(
            Contribution.period_id == period_id
        )
    )
    contributed_rows = (
        await session.execute(
            select(Contribution.member_id, func.sum(Contribution.amount_minor))
            .where(Contribution.period_id == period_id)
            .group_by(Contribution.member_id)
        )
    ).all()
    pledged_rows = (
        await session.execute(
            select(ContributionPledge.member_id, ContributionPledge.expected_amount_minor)
            .where(ContributionPledge.period_id == period_id)
        )
    ).all()
    return (
        int(collected or 0),
        {member_id: int(total) for member_id, total in contributed_rows},
        {member_id: int(expected) for member_id, expected in pledged_rows},
    )
```

- [ ] **Step 5: Write the router**

Create `apps/api/src/family_api/routers/contributions.py`:

```python
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.user import User
from family_api.db.session import get_session
from family_api.errors import NotFoundError
from family_api.schemas.contribution import (
    CreatePeriodRequest, PeriodDetailResponse, PeriodMemberRow, PeriodResponse,
    SetPledgesRequest, UpdatePeriodRequest,
)
from family_api.services import contributions as contribution_service
from family_api.services.members import CurrentMember

router = APIRouter(prefix="/contribution-periods", tags=["contributions"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _currency(session: AsyncSession, household_id: UUID) -> str:
    household = await session.get(Household, household_id)
    assert household is not None
    return household.currency


async def _detail(
    session: AsyncSession, member: HouseholdMember, period
) -> PeriodDetailResponse:
    collected, contributed, pledged = await contribution_service.period_totals(
        session, period.id
    )
    rows = (
        await session.execute(
            select(HouseholdMember.id, User.display_name)
            .join(User, User.id == HouseholdMember.user_id)
            .where(
                HouseholdMember.household_id == member.household_id,
                HouseholdMember.status == "active",
            )
        )
    ).all()

    return PeriodDetailResponse(
        id=period.id, period_month=period.period_month, status=period.status,
        goal_amount_minor=period.goal_amount_minor, collected_minor=collected,
        progress=collected / period.goal_amount_minor if period.goal_amount_minor else 0.0,
        currency=await _currency(session, member.household_id),
        members=[
            PeriodMemberRow(
                member_id=member_id, display_name=name,
                pledged_minor=pledged.get(member_id, 0),
                contributed_minor=contributed.get(member_id, 0),
            )
            for member_id, name in rows
        ],
    )


@router.get("")
async def list_periods(
    member: CurrentMember,
    session: SessionDep,
    status_filter: Literal["open", "closed"] | None = None,
) -> list[PeriodResponse]:
    periods = await contribution_service.list_periods(session, member, status_filter)
    currency = await _currency(session, member.household_id)
    return [
        PeriodResponse(
            id=p.id, period_month=p.period_month,
            goal_amount_minor=p.goal_amount_minor, status=p.status, currency=currency,
        )
        for p in periods
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_period(
    body: CreatePeriodRequest, member: CurrentMember, session: SessionDep
) -> PeriodResponse:
    period = await contribution_service.open_period(
        session, member, body.period_month, body.goal_amount_minor
    )
    await session.commit()
    return PeriodResponse(
        id=period.id, period_month=period.period_month,
        goal_amount_minor=period.goal_amount_minor, status=period.status,
        currency=await _currency(session, member.household_id),
    )


@router.get("/current")
async def current_period(
    member: CurrentMember, session: SessionDep
) -> PeriodDetailResponse:
    """Always visible to every household member (FR-M4-07)."""
    period = await contribution_service.get_open_period(session, member.household_id)
    if period is None:
        raise NotFoundError
    return await _detail(session, member, period)


@router.patch("/{period_id}")
async def update_period(
    period_id: UUID,
    body: UpdatePeriodRequest,
    member: CurrentMember,
    session: SessionDep,
) -> PeriodResponse:
    period = await contribution_service.update_period(
        session, member, period_id, body.goal_amount_minor
    )
    await session.commit()
    return PeriodResponse(
        id=period.id, period_month=period.period_month,
        goal_amount_minor=period.goal_amount_minor, status=period.status,
        currency=await _currency(session, member.household_id),
    )


@router.post("/{period_id}/close")
async def close_period(
    period_id: UUID, member: CurrentMember, session: SessionDep
) -> PeriodResponse:
    period = await contribution_service.close_period(session, member, period_id)
    await session.commit()
    return PeriodResponse(
        id=period.id, period_month=period.period_month,
        goal_amount_minor=period.goal_amount_minor, status=period.status,
        currency=await _currency(session, member.household_id),
    )


@router.put("/{period_id}/pledges")
async def set_pledges(
    period_id: UUID,
    body: SetPledgesRequest,
    member: CurrentMember,
    session: SessionDep,
) -> PeriodDetailResponse:
    await contribution_service.set_pledges(
        session, member, period_id,
        [(p.member_id, p.expected_amount_minor) for p in body.pledges],
    )
    await session.commit()
    period = await contribution_service._load_period(session, member, period_id)
    return await _detail(session, member, period)
```

Mount in `main.py`: `app.include_router(contributions.router, prefix=API_PREFIX)`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_contribution_periods.py -v`
Expected: PASS — 6 tests

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/integration/test_contribution_periods.py
git commit -m "feat(contributions): add periods and pledges"
```

---

### Task 3: The atomic mirror write

**The defining task of this plan.** Recording a contribution writes two rows in one database transaction: the contribution, and the contributor's personal expense (FR-M4-05, INV-D-01).

**Files:**
- Modify: `apps/api/src/family_api/services/contributions.py`, `apps/api/src/family_api/routers/contributions.py`, `apps/api/src/family_api/main.py`
- Test: `apps/api/tests/integration/test_contributions.py`

**Interfaces:**
- Consumes: `Transaction`, `Category`, `CONTRIBUTION_CATEGORY`, period service (Task 2).
- Produces: `record_contribution(session, member, period_id, amount_minor, paid_on, note) -> Contribution`; `delete_contribution(session, member, contribution_id) -> None`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_contributions.py`:

```python
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
    assert ledger.json()["items"][0]["category_name"] == "Aporte al hogar"


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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_contributions.py -v`
Expected: FAIL — 404 on the contributions sub-route

- [ ] **Step 3: Write the mirror service**

Append to `apps/api/src/family_api/services/contributions.py`:

```python
from family_api.db.models.seeded import Category
from family_api.db.models.transaction import Transaction
from family_api.errors import ForbiddenRoleError
from family_api.services.households import CONTRIBUTION_CATEGORY


async def record_contribution(
    session: AsyncSession,
    member: HouseholdMember,
    period_id: UUID,
    amount_minor: int,
    paid_on: date,
    note: str | None,
) -> Contribution:
    """Write the contribution AND the contributor's personal expense atomically.

    INV-D-01 / FR-M4-05: either both rows exist or neither does. The caller
    commits; every write below is inside that one transaction, so an error
    anywhere rolls back both.
    """
    if member.role == "guest":
        raise ForbiddenRoleError

    period = await _load_period(session, member, period_id)
    if period.status == "closed":
        raise PeriodClosedError

    category = await session.scalar(
        select(Category).where(
            Category.household_id == member.household_id,
            Category.kind == "expense",
            Category.name == CONTRIBUTION_CATEGORY,
        )
    )
    if category is None:
        raise NotFoundError

    contribution_id = new_id()
    transaction = Transaction(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        kind="expense", category_id=category.id, amount_minor=amount_minor,
        occurred_on=paid_on, note=note,
        source="contribution", source_id=contribution_id,
    )
    session.add(transaction)
    await session.flush()

    contribution = Contribution(
        id=contribution_id, household_id=member.household_id, period_id=period.id,
        member_id=member.id, amount_minor=amount_minor, paid_on=paid_on, note=note,
        expense_transaction_id=transaction.id,
    )
    session.add(contribution)
    await session.flush()
    return contribution


async def delete_contribution(
    session: AsyncSession, actor: HouseholdMember, contribution_id: UUID
) -> None:
    """Removes the contribution and its mirrored expense atomically (FR-M4-06).

    Order matters: the contribution holds an ON DELETE RESTRICT FK to the
    transaction, so the contribution must go first.
    """
    contribution = await session.scalar(
        select(Contribution).where(
            Contribution.id == contribution_id,
            Contribution.household_id == actor.household_id,
        )
    )
    if contribution is None:
        raise NotFoundError
    if contribution.member_id != actor.id and actor.role != "admin":
        raise ForbiddenRoleError

    transaction_id = contribution.expense_transaction_id
    await session.delete(contribution)
    await session.flush()

    transaction = await session.get(Transaction, transaction_id)
    if transaction is not None:
        await session.delete(transaction)
    await session.flush()
```

- [ ] **Step 4: Add the routes**

Append to `apps/api/src/family_api/routers/contributions.py`:

```python
from family_api.schemas.contribution import ContributionResponse, CreateContributionRequest


@router.post("/{period_id}/contributions", status_code=status.HTTP_201_CREATED)
async def record_contribution(
    period_id: UUID,
    body: CreateContributionRequest,
    member: CurrentMember,
    session: SessionDep,
) -> ContributionResponse:
    contribution = await contribution_service.record_contribution(
        session, member, period_id, body.amount_minor, body.paid_on, body.note
    )
    await session.commit()
    return ContributionResponse(
        id=contribution.id, member_id=contribution.member_id,
        amount_minor=contribution.amount_minor,
        currency=await _currency(session, member.household_id),
        paid_on=contribution.paid_on, note=contribution.note,
        expense_transaction_id=contribution.expense_transaction_id,
    )
```

Create a second router in the same file for the flat delete path (`docs/api-contract.md` §8 lists it as `DELETE /contributions/{id}`):

```python
contributions_router = APIRouter(prefix="/contributions", tags=["contributions"])


@contributions_router.delete("/{contribution_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contribution(
    contribution_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await contribution_service.delete_contribution(session, member, contribution_id)
    await session.commit()
```

Mount both in `main.py`:

```python
    app.include_router(contributions.router, prefix=API_PREFIX)
    app.include_router(contributions.contributions_router, prefix=API_PREFIX)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_contributions.py -v`
Expected: PASS — 6 tests

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/integration/test_contributions.py
git commit -m "feat(contributions): add atomic mirrored expense"
```

---

### Task 4: Proving the mirror is atomic under failure

The previous task proved the happy path. This proves the **rollback** path — L-02. A mirror that works until something goes wrong is not a mirror.

**Files:**
- Test: `apps/api/tests/integration/test_mirror_atomicity.py`

**Interfaces:**
- Consumes: `record_contribution`, `delete_contribution` (Task 3).
- Produces: nothing. This task is the proof.

- [ ] **Step 1: Write the test**

Create `apps/api/tests/integration/test_mirror_atomicity.py`:

```python
"""L-02: if the contribution write fails partway, NEITHER row survives.

These tests commit for real, so they use their own engine rather than the
rolled-back `db_session` fixture, and clean up explicitly.
"""

from datetime import date

import pytest
from sqlalchemy import delete, select

from family_api.config import get_settings
from family_api.db.models.contribution import Contribution, ContributionPeriod
from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.seeded import Category, VisibilitySetting
from family_api.db.models.transaction import Transaction
from family_api.db.models.user import User
from family_api.db.session import engine_for, session_factory_for
from family_api.ids import new_id
from family_api.security.passwords import hash_password
from family_api.services import contributions as contribution_service
from family_api.services.households import create_household


@pytest.fixture
def factory():
    engine = engine_for(get_settings().test_database_url)
    yield session_factory_for(engine)


@pytest.mark.asyncio
async def test_a_failure_after_the_expense_insert_leaves_no_rows(factory) -> None:
    async with factory() as session:
        user = User(
            id=new_id(), email="atomic@example.com",
            password_hash=hash_password("correct-horse-battery"), display_name="Atomic",
        )
        session.add(user)
        await session.flush()
        household, member = await create_household(session, user, "Atomicity")
        period = ContributionPeriod(
            id=new_id(), household_id=household.id,
            period_month=date(2026, 9, 1), goal_amount_minor=2_000_000, status="open",
        )
        session.add(period)
        await session.commit()
        household_id, member_id, period_id = household.id, member.id, period.id

    # Force a failure between the two inserts by removing the category the
    # mirror depends on, mid-flight.
    async with factory() as session:
        member_obj = await session.get(HouseholdMember, member_id)
        assert member_obj is not None
        await session.execute(
            delete(Category).where(
                Category.household_id == household_id, Category.name == "Aporte al hogar"
            )
        )
        await session.flush()

        with pytest.raises(Exception):
            await contribution_service.record_contribution(
                session, member_obj, period_id, 1_000_000, date(2026, 9, 5), None
            )
        await session.rollback()

    async with factory() as session:
        contributions = (await session.scalars(select(Contribution))).all()
        orphans = (
            await session.scalars(
                select(Transaction).where(Transaction.source == "contribution")
            )
        ).all()
        assert contributions == []
        assert orphans == [], "An expense survived without its contribution"

    async with factory() as session:
        await session.execute(
            delete(VisibilitySetting).where(VisibilitySetting.household_id == household_id)
        )
        await session.execute(
            delete(ContributionPeriod).where(ContributionPeriod.household_id == household_id)
        )
        await session.execute(
            delete(HouseholdMember).where(HouseholdMember.household_id == household_id)
        )
        await session.execute(delete(Category).where(Category.household_id == household_id))
        await session.execute(delete(Household).where(Household.id == household_id))
        await session.execute(delete(User).where(User.email == "atomic@example.com"))
        await session.commit()


@pytest.mark.asyncio
async def test_a_transaction_cannot_be_deleted_while_a_contribution_points_at_it(
    factory,
) -> None:
    """ON DELETE RESTRICT: the database refuses to orphan a contribution."""
    from sqlalchemy.exc import IntegrityError

    async with factory() as session:
        user = User(
            id=new_id(), email="restrict@example.com",
            password_hash=hash_password("correct-horse-battery"), display_name="Restrict",
        )
        session.add(user)
        await session.flush()
        household, member = await create_household(session, user, "Restrict")
        period = ContributionPeriod(
            id=new_id(), household_id=household.id,
            period_month=date(2026, 9, 1), goal_amount_minor=2_000_000, status="open",
        )
        session.add(period)
        await session.flush()
        contribution = await contribution_service.record_contribution(
            session, member, period.id, 500_000, date(2026, 9, 5), None
        )
        await session.commit()
        household_id = household.id
        transaction_id = contribution.expense_transaction_id

    async with factory() as session:
        transaction = await session.get(Transaction, transaction_id)
        assert transaction is not None
        await session.delete(transaction)
        with pytest.raises(IntegrityError):
            await session.commit()

    async with factory() as session:
        await session.execute(delete(Contribution).where(
            Contribution.household_id == household_id))
        await session.execute(delete(Transaction).where(
            Transaction.household_id == household_id))
        await session.execute(delete(VisibilitySetting).where(
            VisibilitySetting.household_id == household_id))
        await session.execute(delete(ContributionPeriod).where(
            ContributionPeriod.household_id == household_id))
        await session.execute(delete(HouseholdMember).where(
            HouseholdMember.household_id == household_id))
        await session.execute(delete(Category).where(
            Category.household_id == household_id))
        await session.execute(delete(Household).where(Household.id == household_id))
        await session.execute(delete(User).where(User.email == "restrict@example.com"))
        await session.commit()
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/api && pytest tests/integration/test_mirror_atomicity.py -v`
Expected: PASS — 2 tests

If the first test finds an orphaned transaction, the mirror is **not** atomic. Fix `record_contribution` so both writes share one transaction; do not relax the assertion.

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/integration/test_mirror_atomicity.py
git commit -m "test(contributions): prove mirror atomicity"
```

---

### Task 5: Contribution visibility — the two-surfaces rule

Implements `docs/visibility-rules.md` §5.2, the subtlest rule in the product.

**Files:**
- Test: `apps/api/tests/visibility/test_contribution_visibility.py`

**Interfaces:**
- Consumes: contribution endpoints (Tasks 2–3), member finance endpoints (Plan 2 Task 9).
- Produces: nothing. This task pins behaviour that a future "simplification" would break.

- [ ] **Step 1: Write the test**

Create `apps/api/tests/visibility/test_contribution_visibility.py`:

```python
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
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/api && pytest tests/visibility/test_contribution_visibility.py -v`
Expected: PASS — 4 tests

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/visibility/test_contribution_visibility.py
git commit -m "test(visibility): pin contribution two-surface rule"
```

---

### Task 6: The Phase 1 dashboard

**Files:**
- Create: `apps/api/src/family_api/schemas/dashboard.py`, `apps/api/src/family_api/services/dashboard.py`, `apps/api/src/family_api/routers/dashboard.py`
- Modify: `apps/api/src/family_api/main.py`
- Test: `apps/api/tests/integration/test_dashboard.py`

**Interfaces:**
- Consumes: `resolve`, `Level`, `MODULES` (Plan 2 Task 7); `total_for`, `total_balance`, `total_outstanding`; contribution period service.
- Produces: `build_dashboard(session, member, period) -> DashboardResponse`; `GET /dashboard`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_dashboard.py`:

```python
import pytest
from httpx import AsyncClient


async def _household(client: AsyncClient) -> tuple[dict, dict, str]:
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
    listed = await client.get("/api/v1/households/current", headers=admin)
    papa_id = next(
        m["id"] for m in listed.json()["members"] if m["display_name"] == "Papá"
    )
    return admin, papa, papa_id


async def _earn(client: AsyncClient, headers: dict, amount: int) -> None:
    categories = await client.get("/api/v1/categories?kind=income", headers=headers)
    salario = next(c["id"] for c in categories.json() if c["name"] == "Salario")
    await client.post(
        "/api/v1/me/transactions",
        json={
            "kind": "income", "category_id": salario,
            "amount_minor": amount, "occurred_on": "2026-09-05",
        },
        headers=headers,
    )


@pytest.mark.asyncio
async def test_household_totals_include_private_members(client: AsyncClient) -> None:
    """FR-D1-02 / spec §8.4.

    The derivability leak is disclosed, not fixed by suppression. Excluding
    private members would make the dashboard wrong AND create a new leak.
    """
    admin, papa, _ = await _household(client)
    await _earn(client, admin, 2_500_000)
    await _earn(client, papa, 3_000_000)
    await client.put(
        "/api/v1/me/visibility",
        json={m: "private" for m in ("income", "expenses", "savings", "debts")},
        headers=papa,
    )

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)

    assert response.status_code == 200
    assert response.json()["household"]["income_minor"] == 5_500_000


@pytest.mark.asyncio
async def test_a_private_module_carries_level_and_no_figure(
    client: AsyncClient,
) -> None:
    """A private module must not be `null` or `0` — both are disclosures."""
    admin, papa, papa_id = await _household(client)
    await _earn(client, papa, 3_000_000)
    await client.put(
        "/api/v1/me/visibility",
        json={m: "private" for m in ("income", "expenses", "savings", "debts")},
        headers=papa,
    )

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)
    card = next(m for m in response.json()["members"] if m["member_id"] == papa_id)

    assert card["income"] == {"level": "private"}
    assert "total_minor" not in card["income"]


@pytest.mark.asyncio
async def test_a_summary_module_carries_the_total(client: AsyncClient) -> None:
    admin, papa, papa_id = await _household(client)
    await _earn(client, papa, 3_000_000)

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)
    card = next(m for m in response.json()["members"] if m["member_id"] == papa_id)

    assert card["income"]["level"] == "summary"
    assert card["income"]["total_minor"] == 3_000_000


@pytest.mark.asyncio
async def test_a_fully_private_member_shows_identity_only(
    client: AsyncClient,
) -> None:
    """FR-D1-03."""
    admin, papa, papa_id = await _household(client)
    await client.put(
        "/api/v1/me/visibility",
        json={m: "private" for m in ("income", "expenses", "savings", "debts")},
        headers=papa,
    )

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=admin)
    card = next(m for m in response.json()["members"] if m["member_id"] == papa_id)

    assert card["display_name"] == "Papá"
    assert all(
        card[module] == {"level": "private"}
        for module in ("income", "expenses", "savings", "debts")
    )


@pytest.mark.asyncio
async def test_a_member_sees_their_own_card_in_full(client: AsyncClient) -> None:
    """VR-03 applies on the dashboard too."""
    _, papa, papa_id = await _household(client)
    await _earn(client, papa, 3_000_000)
    await client.put(
        "/api/v1/me/visibility",
        json={m: "private" for m in ("income", "expenses", "savings", "debts")},
        headers=papa,
    )

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=papa)
    card = next(m for m in response.json()["members"] if m["member_id"] == papa_id)

    assert card["income"]["level"] == "full"
    assert card["income"]["total_minor"] == 3_000_000


@pytest.mark.asyncio
async def test_a_guest_sees_aggregates_but_no_member_figures(
    client: AsyncClient,
) -> None:
    """VR-02."""
    admin, papa, papa_id = await _household(client)
    await _earn(client, papa, 3_000_000)
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

    response = await client.get("/api/v1/dashboard?period=2026-09", headers=guest)

    assert response.status_code == 200
    assert response.json()["household"]["income_minor"] == 3_000_000
    card = next(m for m in response.json()["members"] if m["member_id"] == papa_id)
    assert card["income"] == {"level": "private"}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_dashboard.py -v`
Expected: FAIL — 404 on `/api/v1/dashboard`

- [ ] **Step 3: Write the schema**

Create `apps/api/src/family_api/schemas/dashboard.py`:

```python
from uuid import UUID

from pydantic import BaseModel


class ModuleCell(BaseModel):
    """One module on one member's card.

    `total_minor` is ABSENT (not null, not zero) when the level is `private`.
    A null would distinguish "private" from "empty", which is itself a
    disclosure (docs/visibility-rules.md §3.2).
    """

    level: str
    total_minor: int | None = None

    def model_post_init(self, _context: object) -> None:
        return None

    model_config = {"json_schema_extra": {"description": "level plus an optional total"}}


class HouseholdTotals(BaseModel):
    income_minor: int
    expenses_minor: int
    savings_minor: int


class ContributionSummary(BaseModel):
    goal_amount_minor: int
    collected_minor: int
    progress: float


class MemberCard(BaseModel):
    member_id: UUID
    display_name: str
    relationship: str | None
    photo_url: str | None
    income: ModuleCell
    expenses: ModuleCell
    savings: ModuleCell
    debts: ModuleCell


class DashboardResponse(BaseModel):
    period: str
    currency: str
    household: HouseholdTotals
    contribution: ContributionSummary | None
    members: list[MemberCard]
```

`ModuleCell` must serialize with `exclude_none=True` so a private cell emits `{"level": "private"}` and nothing else. The router below enforces that.

- [ ] **Step 4: Write the service**

Create `apps/api/src/family_api/services/dashboard.py`:

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.user import User
from family_api.periods import parse_period
from family_api.schemas.dashboard import (
    ContributionSummary, DashboardResponse, HouseholdTotals, MemberCard, ModuleCell,
)
from family_api.services import contributions as contribution_service
from family_api.services import debts as debt_service
from family_api.services import savings as savings_service
from family_api.services import transactions as transaction_service
from family_api.services.visibility import Level, resolve


async def _cell(
    session: AsyncSession,
    viewer: HouseholdMember,
    owner: HouseholdMember,
    module: str,
    value: int,
) -> ModuleCell:
    level = await resolve(session, viewer, owner, module)
    if level is Level.NONE:
        # No figure at all. Not null, not zero.
        return ModuleCell(level="private")
    return ModuleCell(level=level.value, total_minor=value)


async def build_dashboard(
    session: AsyncSession, viewer: HouseholdMember, period: str | None
) -> DashboardResponse:
    household = await session.get(Household, viewer.household_id)
    assert household is not None
    start, end = parse_period(period, household.timezone)
    period_label = f"{start.year:04d}-{start.month:02d}"

    rows = (
        await session.execute(
            select(HouseholdMember, User)
            .join(User, User.id == HouseholdMember.user_id)
            .where(
                HouseholdMember.household_id == household.id,
                HouseholdMember.status == "active",
            )
        )
    ).all()

    household_income = household_expenses = household_savings = 0
    cards: list[MemberCard] = []

    for owner, user in rows:
        income = await transaction_service.total_for(session, owner.id, "income", start, end)
        expenses = await transaction_service.total_for(
            session, owner.id, "expense", start, end
        )
        savings = await savings_service.total_balance(session, owner.id)
        debts = await debt_service.total_outstanding(session, owner.id)

        # FR-D1-02: household totals include EVERY member, private ones
        # included. See spec §8.4 for why suppression was rejected.
        household_income += income
        household_expenses += expenses
        household_savings += savings

        cards.append(
            MemberCard(
                member_id=owner.id, display_name=user.display_name,
                relationship=owner.relationship, photo_url=user.photo_url,
                income=await _cell(session, viewer, owner, "income", income),
                expenses=await _cell(session, viewer, owner, "expenses", expenses),
                savings=await _cell(session, viewer, owner, "savings", savings),
                debts=await _cell(session, viewer, owner, "debts", debts),
            )
        )

    open_period = await contribution_service.get_open_period(session, household.id)
    contribution = None
    if open_period is not None:
        collected, _, _ = await contribution_service.period_totals(session, open_period.id)
        contribution = ContributionSummary(
            goal_amount_minor=open_period.goal_amount_minor,
            collected_minor=collected,
            progress=collected / open_period.goal_amount_minor
            if open_period.goal_amount_minor else 0.0,
        )

    return DashboardResponse(
        period=period_label, currency=household.currency,
        household=HouseholdTotals(
            income_minor=household_income,
            expenses_minor=household_expenses,
            savings_minor=household_savings,
        ),
        contribution=contribution, members=cards,
    )
```

- [ ] **Step 5: Write the router**

Create `apps/api/src/family_api/routers/dashboard.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.session import get_session
from family_api.services.dashboard import build_dashboard
from family_api.services.members import CurrentMember

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("")
async def dashboard(
    member: CurrentMember, session: SessionDep, period: str | None = None
) -> JSONResponse:
    """Returned via JSONResponse with exclude_none so a private module cell
    emits {"level": "private"} and no figure key at all."""
    payload = await build_dashboard(session, member, period)
    return JSONResponse(content=payload.model_dump(mode="json", exclude_none=True))
```

Mount in `main.py`: `app.include_router(dashboard.router, prefix=API_PREFIX)`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_dashboard.py -v`
Expected: PASS — 6 tests

Note: `exclude_none=True` also strips a legitimately absent `contribution`. That is correct — a household with no open period simply has no contribution block.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/integration/test_dashboard.py
git commit -m "feat(dashboard): add phase 1 household dashboard"
```

---

### Task 7: Third-member loan visibility

Closes the gap Plan 2's self-review flagged: `visibility-rules.md` §5.1 says a loan resolves against the **borrower's** `debts` setting for a member who is not a party to it. Plan 2 only ever returned loans the caller was party to, so this rule had nowhere to live until the household view existed.

**Files:**
- Modify: `apps/api/src/family_api/services/loans.py`, `apps/api/src/family_api/routers/loans.py`
- Test: `apps/api/tests/visibility/test_third_party_loans.py`

**Interfaces:**
- Consumes: `list_loans` (Plan 2 Task 6), `resolve`, `Level`.
- Produces: `list_household_loans(session, viewer) -> list[tuple[MemberLoan, int]]`; `GET /loans?scope=household`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/visibility/test_third_party_loans.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/visibility/test_third_party_loans.py -v`
Expected: FAIL — `scope` is not a recognised query parameter, so all loans return unfiltered

- [ ] **Step 3: Write the service function**

Append to `apps/api/src/family_api/services/loans.py`:

```python
from family_api.services.visibility import Level, resolve


async def list_household_loans(
    session: AsyncSession, viewer: HouseholdMember
) -> list[tuple[MemberLoan, int]]:
    """Every loan in the household the viewer may see.

    docs/visibility-rules.md §5.1:
      - A party to the loan always sees it (FR-M2-16), whatever the settings.
      - Anyone else resolves it against the BORROWER's `debts` setting,
        because a loan is a debt and the borrower is the exposed party.
    """
    stmt = (
        select(
            MemberLoan,
            MemberLoan.amount_minor
            - func.coalesce(func.sum(MemberLoanPayment.amount_minor), 0),
        )
        .outerjoin(MemberLoanPayment, MemberLoanPayment.loan_id == MemberLoan.id)
        .where(MemberLoan.household_id == viewer.household_id)
        .group_by(MemberLoan.id)
        .order_by(MemberLoan.lent_on.desc())
    )
    rows = [(loan, int(out or 0)) for loan, out in (await session.execute(stmt)).all()]

    visible: list[tuple[MemberLoan, int]] = []
    for loan, outstanding in rows:
        if viewer.id in (loan.lender_member_id, loan.borrower_member_id):
            visible.append((loan, outstanding))
            continue

        borrower = await session.get(HouseholdMember, loan.borrower_member_id)
        if borrower is None:
            continue
        if await resolve(session, viewer, borrower, "debts") is not Level.NONE:
            visible.append((loan, outstanding))

    return visible
```

- [ ] **Step 4: Add the query parameter**

Replace the `list_loans` route in `apps/api/src/family_api/routers/loans.py`:

```python
@router.get("")
async def list_loans(
    member: CurrentMember,
    session: SessionDep,
    role: Literal["lender", "borrower", "all"] = "all",
    scope: Literal["mine", "household"] = "mine",
) -> list[LoanResponse]:
    """`scope=mine` returns loans the caller is party to (FR-M2-16).
    `scope=household` adds third-party loans the caller may see (§5.1)."""
    if scope == "household":
        rows = await loan_service.list_household_loans(session, member)
    else:
        rows = await loan_service.list_loans(session, member, role)
    return [await _render(session, member, loan, out) for loan, out in rows]
```

`_render` sets `perspective` from whether the caller is the lender. For a third-party loan the caller is neither, so it renders as `"borrower"`. Change `_render` so a non-party renders explicitly:

```python
        perspective=(
            "lender" if loan.lender_member_id == member.id
            else "borrower" if loan.borrower_member_id == member.id
            else "observer"
        ),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/visibility/test_third_party_loans.py -v`
Expected: PASS — 5 tests

- [ ] **Step 6: Verify the route coverage test still passes**

Run: `cd apps/api && pytest tests/visibility/test_route_coverage.py -v`
Expected: PASS. `/api/v1/loans` remains exempt because it resolves per row inside the service rather than through a route-level dependency — that exemption is already commented in `EXEMPT_PREFIXES`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/visibility/test_third_party_loans.py
git commit -m "feat(loans): add third-party household visibility"
```

---

### Task 8: Full-suite verification and seed extension

**Files:**
- Modify: `apps/api/scripts/seed.py`
- Test: `apps/api/tests/integration/test_seed.py`

**Interfaces:**
- Consumes: everything above.
- Produces: a seed that includes an open contribution period with the spec's example figures.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/tests/integration/test_seed.py`:

```python
@pytest.mark.asyncio
async def test_seed_creates_the_spec_contribution_period(
    db_session: AsyncSession,
) -> None:
    """Spec §6.4: target 2.000.000, collected 1.900.000, 95%."""
    from sqlalchemy import func

    from family_api.db.models.contribution import Contribution, ContributionPeriod

    await seed_demo_household(db_session)

    period = await db_session.scalar(select(ContributionPeriod))
    assert period is not None
    assert period.goal_amount_minor == 2_000_000
    assert period.status == "open"

    collected = await db_session.scalar(
        select(func.coalesce(func.sum(Contribution.amount_minor), 0))
    )
    assert collected == 1_900_000


@pytest.mark.asyncio
async def test_every_seeded_contribution_has_a_mirrored_expense(
    db_session: AsyncSession,
) -> None:
    """INV-D-01 holds for seeded data too."""
    from family_api.db.models.contribution import Contribution
    from family_api.db.models.transaction import Transaction

    await seed_demo_household(db_session)

    contributions = (await db_session.scalars(select(Contribution))).all()
    mirrored = (
        await db_session.scalars(
            select(Transaction).where(Transaction.source == "contribution")
        )
    ).all()

    assert len(contributions) == len(mirrored) == 3
    assert {c.expense_transaction_id for c in contributions} == {t.id for t in mirrored}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pytest tests/integration/test_seed.py -v`
Expected: FAIL — no contribution period exists

- [ ] **Step 3: Extend the seed**

In `apps/api/scripts/seed.py`, add the imports and append this block to `seed_demo_household`, just before the final `await session.flush()`:

```python
from datetime import date

from family_api.db.models.contribution import ContributionPeriod, ContributionPledge
from family_api.services.contributions import record_contribution

# Spec §6.4: meta $2.000.000, recaudado $1.900.000, 95%.
CONTRIBUTIONS = {
    "Papá": (1_000_000, 1_000_000),   # (pledged, contributed)
    "Mamá": (600_000, 600_000),
    "Daniel": (400_000, 300_000),
}
```

```python
    period = ContributionPeriod(
        id=new_id(), household_id=household.id,
        period_month=date.today().replace(day=1),
        goal_amount_minor=2_000_000, status="open",
    )
    session.add(period)
    await session.flush()

    all_members = (
        await session.execute(
            select(HouseholdMember, User)
            .join(User, User.id == HouseholdMember.user_id)
            .where(HouseholdMember.household_id == household.id)
        )
    ).all()

    for seeded_member, seeded_user in all_members:
        entry = CONTRIBUTIONS.get(seeded_user.display_name)
        if entry is None:
            continue
        pledged, contributed = entry
        session.add(
            ContributionPledge(
                id=new_id(), household_id=household.id, period_id=period.id,
                member_id=seeded_member.id, expected_amount_minor=pledged,
            )
        )
        await session.flush()
        # Goes through the service, so the mirror is exercised by the seed too.
        await record_contribution(
            session, seeded_member, period.id, contributed,
            date.today(), "Aporte del mes",
        )
```

Note `Hermano` is absent from `CONTRIBUTIONS` on purpose: a member with no contribution exercises the zero row on the period dashboard.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_seed.py -v`
Expected: PASS — 4 tests

- [ ] **Step 5: Run the whole suite and the linters**

Run: `cd apps/api && pytest -v && ruff check . && mypy src`
Expected: all PASS. **Paste real output — do not summarize from memory.**

- [ ] **Step 6: Verify migrations reverse from empty**

Run:
```bash
cd apps/api && DATABASE_URL=$TEST_DATABASE_URL alembic downgrade base \
  && DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head
```
Expected: both succeed.

- [ ] **Step 7: Verify against a real database**

Run: `make db && make migrate && make seed && make api-dev`

Then, logged in as Daniel, confirm `GET /api/v1/dashboard` returns household totals, a contribution block at 95%, and member cards whose modules reflect the seeded mixed visibility — Papá's savings public, Hermano fully private.

- [ ] **Step 8: Commit**

```bash
git add apps/api/scripts/seed.py apps/api/tests/integration/test_seed.py
git commit -m "feat(seed): add contribution period to demo data"
```

---

## Plan Self-Review

**1. Spec coverage.**

| Requirement | Task |
| ----------- | ---- |
| FR-M4-01 admin opens a monthly period, one per month | 1 (constraint), 2 (service) |
| FR-M4-02 optional per-member pledges | 2 |
| FR-M4-03 member records a contribution | 3 |
| FR-M4-04 target, collected, percentage, per-member rows | 2 (`_detail`), 3 (test) |
| FR-M4-05 atomic mirrored expense | 3, proven in 4 |
| FR-M4-06 deletion removes both atomically | 3, 4 |
| FR-M4-07 contributions always household-visible | 2, 5 |
| FR-M4-08 closed period rejects contributions and target edits | 2, 3 |
| FR-M2-05 derived records reject direct edit/delete | 3 (test; guard built in Plan 2) |
| FR-D1-01 dashboard composition | 6 |
| FR-D1-02 household totals include private members | 6 |
| FR-D1-03 fully private member shows identity only | 6 |
| INV-D-01 atomicity | 4 |
| visibility-rules §5.1 third-member loans | 7 |
| visibility-rules §5.2 two surfaces, two rules | 5 |
| L-01 · L-02 · L-03 · L-04 | 3 · 4 · 3 · 3 |

**Gap closed from Plan 2:** §5.1's third-member loan rule, which Plan 2's self-review flagged as unimplementable there. Task 7 owns it.

**Still deferred to Plan 4 (web):** the disclosure copy from §6 is served by the API (`DISCLOSURES`, Plan 2 Task 11) but nothing renders it yet. Plan 4 must display both strings on the privacy settings screen; FR-M3-08 is not satisfied until it does.

**2. Placeholder scan.** None.

**3. Type consistency.** `ContributionPeriod`/`Contribution`/`ContributionPledge` (Task 1 → 2, 3, 6, 8), `PeriodClosedError`/`PeriodExistsError` (2 → 3), `_load_period` (2 → 3), `get_open_period` (2 → 6), `period_totals` returning `(collected, contributed_by_member, pledged_by_member)` (2 → 2, 6), `record_contribution` (3 → 4, 8), `CONTRIBUTION_CATEGORY` (Plan 1 → 3), `ModuleCell`/`MemberCard`/`DashboardResponse` (6 → 6), `resolve`/`Level` (Plan 2 → 6, 7), `list_household_loans` (7 → 7), `_render` perspective now three-valued (7 — **this changes an existing Plan 2 function**; Plan 4's `LoanCard` must handle `"observer"`).

**One behaviour worth re-checking during execution:** `ModuleCell` relies on the router's `exclude_none=True` to omit `total_minor` for a private cell. If a future change serializes the dashboard through FastAPI's normal `response_model` path instead, `total_minor: null` would appear and become a disclosure. Task 6's test asserts `"total_minor" not in card["income"]`, which catches exactly that regression — do not weaken it to a null check.
