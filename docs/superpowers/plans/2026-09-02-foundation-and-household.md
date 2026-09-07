# Foundation & Household Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Family Hub API foundation and Module 1 (household management) — a running FastAPI service where a user can register, create a household, issue invite codes, join with one, and manage members.

**Architecture:** Async FastAPI over PostgreSQL 16 with SQLAlchemy 2.0 and Alembic. Four strictly one-directional layers: `routers → services → repositories → models`. Routers parse and serialize; services own business rules and transaction boundaries; repositories build queries and apply household scoping in one place; models map tables. Domain errors are raised by services and translated to RFC 9457 `problem+json` by middleware.

**Tech Stack:** Python 3.12 · FastAPI · SQLAlchemy 2.0 (async, asyncpg) · Alembic · Pydantic v2 + pydantic-settings · PyJWT · argon2-cffi · pytest + pytest-asyncio + httpx · ruff · mypy

**Spec:** `docs/superpowers/specs/2026-09-02-family-hub-design.md`

**Also read before starting:** `docs/data-model.md` (schema), `docs/api-contract.md` (endpoints and error catalogue), `docs/glossary.md` (naming), `docs/testing-strategy.md` (definition of done).

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **Money is `BIGINT` minor units + an ISO-4217 currency code. Never `float`, never `Decimal` on transport.** COP has **0** minor units, so `amount_minor` holds whole pesos.
- **All money amounts are strictly positive** (`CHECK (amount_minor > 0)`). Direction lives in a kind column, never in a sign.
- **Code, identifiers, comments, commits, tests and error slugs are English. User-facing strings are Spanish (`es-CO`).** Translate through `docs/glossary.md`; never invent a synonym.
- **Financial dates are plain `DATE`. Audit fields are `TIMESTAMPTZ` in UTC.** Period boundaries are computed in the household's timezone.
- **Age is derived from `birth_date` at read time and never stored** (FR-M1-06).
- **No role grants visibility into another member's finances.** Admin is a logistics role only.
- **A missing visibility setting resolves to the module default, never to `public`. Fail closed** (VR-05).
- **Defaults on joining a household:** `income`, `expenses`, `savings` → `summary`; `debts` → **`private`** (FR-M3-03).
- **A household always has at least one active administrator** (INV-R-01).
- **A user belongs to at most one household** (FR-M1-02).
- **Invite codes are 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`** — excludes `0 O 1 I L` (FR-M1-03).
- **Log lines never contain amounts, notes, category names, or any financial field.**
- **Tests run against real PostgreSQL 16, never SQLite.** The schema depends on native enums, `CITEXT` and `SELECT ... FOR UPDATE`.
- **Commits follow `<type>(<scope>): <subject>`** — imperative, ≤ 50 characters, no trailing period.

---

## File Structure

Created by this plan. Each file has one responsibility.

```
apps/api/
├── pyproject.toml                     # deps, ruff, mypy, pytest config
├── alembic.ini
├── migrations/
│   ├── env.py                         # async Alembic environment
│   └── versions/
│       ├── 0001_enums.py              # CREATE TYPE + citext extension
│       ├── 0002_users.py              # users, refresh_tokens
│       ├── 0003_households.py         # households, household_members, invite_codes
│       └── 0004_seeded_tables.py      # categories, visibility_settings
├── src/family_api/
│   ├── main.py                        # app factory, router mounting, error handlers
│   ├── config.py                      # Settings (pydantic-settings)
│   ├── ids.py                         # new_id() — the ONLY place UUID generation lives
│   ├── money.py                       # currency registry, amount validation
│   ├── errors.py                      # DomainError hierarchy + problem+json handlers
│   ├── ratelimit.py                   # in-memory fixed-window limiter
│   ├── db/
│   │   ├── session.py                 # async engine, session dependency
│   │   ├── base.py                    # DeclarativeBase, TimestampMixin
│   │   └── models/
│   │       ├── user.py                # User, RefreshToken
│   │       ├── household.py           # Household, HouseholdMember, InviteCode
│   │       └── seeded.py              # Category, VisibilitySetting
│   ├── security/
│   │   ├── passwords.py               # argon2id hash/verify
│   │   ├── tokens.py                  # JWT issue/decode, refresh hashing
│   │   └── deps.py                    # current_user / current_member dependencies
│   ├── repositories/
│   │   └── base.py                    # HouseholdScopedRepository (INV-D-03)
│   ├── services/
│   │   ├── auth.py                    # register, login, refresh rotation, logout
│   │   ├── households.py              # creation + seeding
│   │   ├── invites.py                 # generation, issue, revoke, redeem
│   │   └── members.py                 # list, update, deactivate, INV-R-01
│   ├── schemas/
│   │   ├── auth.py
│   │   ├── household.py
│   │   └── member.py
│   └── routers/
│       ├── health.py
│       ├── auth.py
│       └── households.py
├── scripts/seed.py                    # Familia Hernández demo household
└── tests/
    ├── conftest.py                    # engine, session, client, factory fixtures
    ├── unit/{test_money,test_ids,test_passwords,test_tokens,test_invite_codes}.py
    └── integration/{test_health,test_auth,test_households,test_invites,test_members}.py

docker-compose.yml                     # postgres:16 only
Makefile
.env.example
.gitattributes
```

---

### Task 1: Repository scaffolding and a running API

**Files:**
- Create: `docker-compose.yml`, `Makefile`, `.env.example`, `.gitattributes`, `apps/api/pyproject.toml`, `apps/api/src/family_api/__init__.py`, `apps/api/src/family_api/config.py`, `apps/api/src/family_api/main.py`, `apps/api/src/family_api/routers/health.py`
- Test: `apps/api/tests/conftest.py`, `apps/api/tests/integration/test_health.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `create_app() -> FastAPI`; `Settings` with fields `database_url: str`, `jwt_secret: str`, `access_token_ttl_minutes: int`, `refresh_token_ttl_days: int`, `cors_origins: list[str]`, `rate_limit_auth_per_minute: int`, `rate_limit_invite_per_hour: int`, `default_currency: str`, `default_timezone: str`; `get_settings() -> Settings`.

- [ ] **Step 1: Create `.gitattributes`**

Git warned about CRLF conversion on this repo. Settle it before any code lands.

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.ico binary
```

- [ ] **Step 2: Create `docker-compose.yml`**

Postgres only. Redis and Celery arrive in Phase 3 (spec §7.5).

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: family
      POSTGRES_PASSWORD: family
      POSTGRES_DB: family
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U family"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

- [ ] **Step 3: Create `.env.example`**

Every key `config.py` reads must appear here (architecture.md §6).

```
DATABASE_URL=postgresql+asyncpg://family:family@localhost:5432/family
TEST_DATABASE_URL=postgresql+asyncpg://family:family@localhost:5432/family_test
JWT_SECRET=change-me-in-production
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=30
CORS_ORIGINS=http://localhost:3000
RATE_LIMIT_AUTH_PER_MINUTE=10
RATE_LIMIT_INVITE_PER_HOUR=20
DEFAULT_CURRENCY=COP
DEFAULT_TIMEZONE=America/Bogota
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001/api/v1
```

Port 8001, not the uvicorn default 8000 — 8000 is occupied by Docker Desktop on
this machine.

- [ ] **Step 4: Create `apps/api/pyproject.toml`**

```toml
[project]
name = "family-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "sqlalchemy[asyncio]>=2.0.36",
    "asyncpg>=0.30",
    "alembic>=1.14",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "pyjwt>=2.10",
    "argon2-cffi>=23.1",
    "uuid6>=2024.7.10",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "httpx>=0.28",
    "ruff>=0.8",
    "mypy>=1.13",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/family_api"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]

[tool.mypy]
python_version = "3.12"
strict = true
plugins = ["pydantic.mypy"]
```

`uuid6` provides UUIDv7 (`docs/data-model.md` §1). Task 2 wraps it in one module so swapping the implementation is a one-line change if the package is unavailable.

- [ ] **Step 5: Create `apps/api/src/family_api/config.py`**

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    test_database_url: str = ""
    jwt_secret: str
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    cors_origins: list[str] = []
    rate_limit_auth_per_minute: int = 10
    rate_limit_invite_per_hour: int = 20
    default_currency: str = "COP"
    default_timezone: str = "America/Bogota"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
```

- [ ] **Step 6: Write the failing test**

Create `apps/api/tests/integration/test_health.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient

from family_api.main import create_app


@pytest.mark.asyncio
async def test_health_returns_ok() -> None:
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd apps/api && pytest tests/integration/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.main'`

- [ ] **Step 8: Write the minimal implementation**

Create `apps/api/src/family_api/routers/health.py`:

```python
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

Create `apps/api/src/family_api/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from family_api.config import get_settings
from family_api.routers import health

API_PREFIX = "/api/v1"


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Family Hub API", version="0.1.0")

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(health.router, prefix=API_PREFIX)
    return app


app = create_app()
```

Create empty `apps/api/src/family_api/__init__.py` and `apps/api/src/family_api/routers/__init__.py`.

- [ ] **Step 9: Create the Makefile**

`make` is not installed on this machine and will not be installed. This
Makefile is kept as living documentation of the command set; run the raw
command shown next to each target directly instead of through `make`.

Port 8001, not uvicorn's default 8000 — 8000 is occupied by Docker Desktop on
this machine.

```makefile
.PHONY: db api-dev web-dev test migrate seed lint

# Raw: docker compose up -d db
db:
	docker compose up -d db

# Raw: cd apps/api && uvicorn family_api.main:app --reload --port 8001
api-dev:
	cd apps/api && uvicorn family_api.main:app --reload --port 8001

# Raw: cd apps/api && pytest -v
test:
	cd apps/api && pytest -v

# Raw: cd apps/api && alembic upgrade head
migrate:
	cd apps/api && alembic upgrade head

# Raw: cd apps/api && python scripts/seed.py
seed:
	cd apps/api && python scripts/seed.py

# Raw: cd apps/api && ruff check . && mypy src
lint:
	cd apps/api && ruff check . && mypy src
```

- [ ] **Step 10: Create and activate the virtual environment**

The `python` on PATH resolves to 3.10, which is too old — this plan requires
3.12+. This machine has 3.13.7 installed, so target it explicitly with the
`py` launcher rather than relying on whatever `python` happens to resolve to.

```powershell
cd apps/api
py -3.13 -m venv .venv
.venv\Scripts\Activate.ps1
```

Confirm the active interpreter is 3.13 before continuing: `python --version`.

- [ ] **Step 11: Run the test to verify it passes**

Run: `cd apps/api && cp ../../.env.example .env && pip install -e ".[dev]" && pytest tests/integration/test_health.py -v`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add .gitattributes docker-compose.yml Makefile .env.example apps/api
git commit -m "chore(api): scaffold FastAPI service"
```

---

### Task 2: ID generation and the money module

Both are used by every later task and both are pure functions, so they get tested in isolation before anything depends on them.

**Files:**
- Create: `apps/api/src/family_api/ids.py`, `apps/api/src/family_api/money.py`
- Test: `apps/api/tests/unit/test_ids.py`, `apps/api/tests/unit/test_money.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `new_id() -> uuid.UUID`; `minor_units(currency: str) -> int`; `validate_amount(amount_minor: int) -> None` (raises `ValueError`); `SUPPORTED_CURRENCIES: frozenset[str]`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/unit/test_ids.py`:

```python
from uuid import UUID

from family_api.ids import new_id


def test_new_id_returns_uuid() -> None:
    assert isinstance(new_id(), UUID)


def test_new_id_is_unique() -> None:
    assert len({new_id() for _ in range(1000)}) == 1000


def test_new_ids_are_time_ordered() -> None:
    """UUIDv7 is time-ordered, which gives index locality on inserts."""
    ids = [new_id() for _ in range(100)]
    assert ids == sorted(ids)
```

Create `apps/api/tests/unit/test_money.py`:

```python
import pytest

from family_api.money import minor_units, validate_amount


def test_cop_has_zero_minor_units() -> None:
    """COP is not divided in practice, so amount_minor holds whole pesos."""
    assert minor_units("COP") == 0


def test_usd_has_two_minor_units() -> None:
    assert minor_units("USD") == 2


def test_currency_lookup_is_case_insensitive() -> None:
    assert minor_units("cop") == 0


def test_unknown_currency_raises() -> None:
    with pytest.raises(ValueError, match="Unsupported currency"):
        minor_units("XYZ")


def test_positive_amount_is_valid() -> None:
    validate_amount(2_000_000)


@pytest.mark.parametrize("amount", [0, -1, -2_000_000])
def test_non_positive_amount_raises(amount: int) -> None:
    """Direction lives in a kind column, never in a sign."""
    with pytest.raises(ValueError, match="must be positive"):
        validate_amount(amount)


def test_amount_must_be_an_integer_not_a_float() -> None:
    with pytest.raises(TypeError, match="must be an integer"):
        validate_amount(1000.50)  # type: ignore[arg-type]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/unit -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.ids'`

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/family_api/ids.py`:

```python
"""The only place UUID generation lives.

UUIDv7 is time-ordered, so primary keys cluster by insertion time and index
pages stay warm. If the `uuid6` package is ever unavailable, swapping to
`uuid.uuid4` is a one-line change here and nowhere else.
"""

from uuid import UUID

from uuid6 import uuid7


def new_id() -> UUID:
    return uuid7()
```

Create `apps/api/src/family_api/money.py`:

```python
"""Money is integer minor units plus a currency code. Never a float.

A float cannot represent 0.1 exactly, so a system that adds money in floats
accumulates error that shows up as a family's totals disagreeing with their
own arithmetic. Integers make that impossible.
"""

MINOR_UNITS: dict[str, int] = {
    "COP": 0,
    "USD": 2,
    "EUR": 2,
}

SUPPORTED_CURRENCIES = frozenset(MINOR_UNITS)


def minor_units(currency: str) -> int:
    """Number of decimal places for a currency. COP has none."""
    try:
        return MINOR_UNITS[currency.upper()]
    except KeyError:
        raise ValueError(f"Unsupported currency: {currency}") from None


def validate_amount(amount_minor: int) -> None:
    """Amounts are strictly positive integers. Direction lives in a kind column."""
    if isinstance(amount_minor, bool) or not isinstance(amount_minor, int):
        raise TypeError("Amount must be an integer number of minor units")
    if amount_minor <= 0:
        raise ValueError("Amount must be positive")
```

`isinstance(amount_minor, bool)` is checked first because `bool` is a subclass of `int` in Python — `validate_amount(True)` would otherwise pass and store `1`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/unit -v`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/family_api/ids.py apps/api/src/family_api/money.py apps/api/tests/unit
git commit -m "feat(api): add id generation and money module"
```

---

### Task 3: Domain errors and problem+json handlers

**Files:**
- Create: `apps/api/src/family_api/errors.py`
- Modify: `apps/api/src/family_api/main.py`
- Test: `apps/api/tests/integration/test_errors.py`

**Interfaces:**
- Consumes: `create_app` (Task 1).
- Produces: `DomainError` base with class attributes `type_slug: str`, `status: int`, `title: str`; subclasses `NotVisibleError`, `ForbiddenRoleError`, `NotFoundError`, `AlreadyInHouseholdError`, `LastAdminError`, `DerivedRecordError`, `InviteNotFoundError`, `InviteExpiredError`, `InviteExhaustedError`, `InviteRevokedError`, `RateLimitedError`; `register_error_handlers(app: FastAPI) -> None`.

Error slugs and statuses come from `docs/api-contract.md` §1.2.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/test_errors.py`:

```python
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from family_api.errors import LastAdminError, NotVisibleError, register_error_handlers


@pytest.fixture
def error_app() -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/boom-visibility")
    async def boom_visibility() -> None:
        raise NotVisibleError

    @app.get("/boom-admin")
    async def boom_admin() -> None:
        raise LastAdminError

    return app


@pytest.mark.asyncio
async def test_domain_error_renders_problem_json(error_app: FastAPI) -> None:
    transport = ASGITransport(app=error_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/boom-visibility")

    assert response.status_code == 403
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["type"] == "not_visible"
    assert body["status"] == 403
    assert body["instance"] == "/boom-visibility"
    assert body["title"]


@pytest.mark.asyncio
async def test_conflict_error_carries_its_own_slug(error_app: FastAPI) -> None:
    transport = ASGITransport(app=error_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/boom-admin")

    assert response.status_code == 409
    assert response.json()["type"] == "last_admin"


@pytest.mark.asyncio
async def test_titles_are_spanish(error_app: FastAPI) -> None:
    """Titles are user-facing copy; clients branch on `type`, never on `title`."""
    assert NotVisibleError.title == "No tienes acceso a esta información"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pytest tests/integration/test_errors.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.errors'`

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/family_api/errors.py`:

```python
"""Domain errors and their RFC 9457 problem+json rendering.

Services raise these; they know nothing about HTTP status codes beyond the
class attribute. Routers never construct them.

`type` is a stable machine-readable slug that clients branch on. `title` is
Spanish user-facing copy that will change.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

PROBLEM_JSON = "application/problem+json"


class DomainError(Exception):
    type_slug: str = "internal_error"
    status: int = 500
    title: str = "Ocurrió un error"


class NotVisibleError(DomainError):
    """Uniform visibility denial.

    Deliberately identical for "not visible", "does not exist" and "other
    household" — the difference between them is itself information
    (docs/visibility-rules.md §4.4).
    """

    type_slug = "not_visible"
    status = 403
    title = "No tienes acceso a esta información"


class ForbiddenRoleError(DomainError):
    type_slug = "forbidden_role"
    status = 403
    title = "Tu rol no permite esta acción"


class NotFoundError(DomainError):
    type_slug = "not_found"
    status = 404
    title = "No se encontró el recurso"


class AlreadyInHouseholdError(DomainError):
    type_slug = "already_in_household"
    status = 409
    title = "Ya perteneces a un hogar"


class LastAdminError(DomainError):
    type_slug = "last_admin"
    status = 409
    title = "El hogar debe tener al menos un administrador"


class DerivedRecordError(DomainError):
    type_slug = "derived_record"
    status = 409
    title = "Este movimiento se gestiona desde su origen"


class InviteNotFoundError(DomainError):
    type_slug = "invite_not_found"
    status = 400
    title = "El código no existe"


class InviteExpiredError(DomainError):
    type_slug = "invite_expired"
    status = 400
    title = "El código expiró"


class InviteExhaustedError(DomainError):
    type_slug = "invite_exhausted"
    status = 400
    title = "El código ya fue utilizado"


class InviteRevokedError(DomainError):
    type_slug = "invite_revoked"
    status = 400
    title = "El código fue revocado"


class InvalidCredentialsError(DomainError):
    type_slug = "invalid_credentials"
    status = 401
    title = "Correo o contraseña incorrectos"


class TokenExpiredError(DomainError):
    type_slug = "token_expired"
    status = 401
    title = "Tu sesión expiró"


class TokenReusedError(DomainError):
    type_slug = "token_reused"
    status = 401
    title = "Tu sesión fue cerrada por seguridad"


class RateLimitedError(DomainError):
    type_slug = "rate_limited"
    status = 429
    title = "Demasiados intentos, espera un momento"


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(request: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status,
            media_type=PROBLEM_JSON,
            content={
                "type": exc.type_slug,
                "title": exc.title,
                "status": exc.status,
                "detail": None,
                "instance": request.url.path,
            },
        )
```

- [ ] **Step 4: Wire it into the app factory**

In `apps/api/src/family_api/main.py`, add the import and call inside `create_app`, immediately after the CORS block:

```python
from family_api.errors import register_error_handlers
```

```python
    register_error_handlers(app)
    app.include_router(health.router, prefix=API_PREFIX)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration -v`
Expected: PASS — health plus 3 error tests

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/family_api/errors.py apps/api/src/family_api/main.py apps/api/tests/integration/test_errors.py
git commit -m "feat(api): add domain errors and problem+json"
```

---

### Task 4: Database session, Alembic, and the enum migration

**Files:**
- Create: `apps/api/src/family_api/db/__init__.py`, `apps/api/src/family_api/db/base.py`, `apps/api/src/family_api/db/session.py`, `apps/api/alembic.ini`, `apps/api/migrations/env.py`, `apps/api/migrations/script.py.mako`, `apps/api/migrations/versions/0001_enums.py`
- Test: `apps/api/tests/integration/test_migrations.py`

**Interfaces:**
- Consumes: `get_settings` (Task 1).
- Produces: `Base` (DeclarativeBase); `TimestampMixin` with `created_at`/`updated_at`; `get_session() -> AsyncIterator[AsyncSession]` FastAPI dependency; `engine_for(url: str) -> AsyncEngine`; `session_factory_for(engine) -> async_sessionmaker[AsyncSession]`.

Enum definitions are copied verbatim from `docs/data-model.md` §2. Phase 1 creates **all** of them, including the ones later plans use — enum creation is cheap, and one migration owning all types avoids ordering problems later.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/test_migrations.py`:

```python
import pytest
from sqlalchemy import text

from family_api.db.session import engine_for
from family_api.config import get_settings


@pytest.mark.asyncio
async def test_all_enum_types_exist_after_migration() -> None:
    """Run `alembic upgrade head` against the test database before this test."""
    engine = engine_for(get_settings().test_database_url)
    expected = {
        "member_role", "member_status", "category_kind", "transaction_kind",
        "transaction_source", "savings_entry_kind", "debt_creditor_type",
        "debt_status", "loan_status", "visibility_module", "visibility_level",
        "period_status",
    }
    async with engine.connect() as conn:
        rows = await conn.execute(text("SELECT typname FROM pg_type WHERE typtype = 'e'"))
        actual = {row[0] for row in rows}
    await engine.dispose()

    assert expected <= actual


@pytest.mark.asyncio
async def test_citext_extension_is_installed() -> None:
    engine = engine_for(get_settings().test_database_url)
    async with engine.connect() as conn:
        result = await conn.scalar(
            text("SELECT count(*) FROM pg_extension WHERE extname = 'citext'")
        )
    await engine.dispose()

    assert result == 1
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pytest tests/integration/test_migrations.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.db'`

- [ ] **Step 3: Write the database module**

Create `apps/api/src/family_api/db/base.py`:

```python
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
```

Create `apps/api/src/family_api/db/session.py`:

```python
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from family_api.config import get_settings


def engine_for(url: str) -> AsyncEngine:
    return create_async_engine(url, pool_pre_ping=True, future=True)


def session_factory_for(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


_engine: AsyncEngine | None = None
_factory: async_sessionmaker[AsyncSession] | None = None


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _engine, _factory
    if _factory is None:
        _engine = engine_for(get_settings().database_url)
        _factory = session_factory_for(_engine)
    return _factory


async def get_session() -> AsyncIterator[AsyncSession]:
    factory = get_session_factory()
    async with factory() as session:
        yield session
```

Create empty `apps/api/src/family_api/db/__init__.py` and `apps/api/src/family_api/db/models/__init__.py`.

- [ ] **Step 4: Initialise Alembic**

Run: `cd apps/api && alembic init -t async migrations`

Then edit `apps/api/alembic.ini` — remove the hardcoded URL line so the environment supplies it:

```ini
sqlalchemy.url =
```

Replace the body of `apps/api/migrations/env.py` config section with:

```python
from family_api.config import get_settings
from family_api.db.base import Base
from family_api.db import models  # noqa: F401  -- registers all mappers

config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata
```

- [ ] **Step 5: Write the enum migration**

Create `apps/api/migrations/versions/0001_enums.py`:

```python
"""Create all enum types and the citext extension.

Revision ID: 0001_enums
Revises:
"""

from alembic import op

revision = "0001_enums"
down_revision = None
branch_labels = None
depends_on = None

ENUMS: dict[str, tuple[str, ...]] = {
    "member_role": ("admin", "adult", "teen", "guest"),
    "member_status": ("active", "invited", "inactive"),
    "category_kind": ("income", "expense"),
    "transaction_kind": ("income", "expense"),
    "transaction_source": ("manual", "contribution"),
    "savings_entry_kind": ("deposit", "withdrawal"),
    "debt_creditor_type": ("bank", "family", "credit_card", "addi", "other"),
    "debt_status": ("active", "paid", "cancelled"),
    "loan_status": ("pending", "partially_paid", "paid", "cancelled"),
    "visibility_module": ("income", "expenses", "savings", "debts"),
    "visibility_level": ("private", "summary", "public"),
    "period_status": ("open", "closed"),
}


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    for name, values in ENUMS.items():
        rendered = ", ".join(f"'{v}'" for v in values)
        op.execute(f"CREATE TYPE {name} AS ENUM ({rendered})")


def downgrade() -> None:
    for name in reversed(list(ENUMS)):
        op.execute(f"DROP TYPE IF EXISTS {name}")
    op.execute("DROP EXTENSION IF EXISTS citext")
```

- [ ] **Step 6: Create the test database and run the migration**

```bash
docker compose up -d db
docker compose exec db psql -U family -c "CREATE DATABASE family_test"
cd apps/api && DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_migrations.py -v`
Expected: PASS — 2 tests

- [ ] **Step 8: Verify the migration reverses**

Run: `cd apps/api && DATABASE_URL=$TEST_DATABASE_URL alembic downgrade base && DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`
Expected: both succeed with no error. Every revision must reverse cleanly (`docs/data-model.md` §9).

- [ ] **Step 9: Commit**

```bash
git add apps/api/alembic.ini apps/api/migrations apps/api/src/family_api/db apps/api/tests/integration/test_migrations.py
git commit -m "feat(db): add session, alembic and enum types"
```

---

### Task 5: User and refresh token models

**Files:**
- Create: `apps/api/src/family_api/db/models/user.py`, `apps/api/migrations/versions/0002_users.py`
- Test: `apps/api/tests/conftest.py`, `apps/api/tests/integration/test_user_model.py`

**Interfaces:**
- Consumes: `Base`, `TimestampMixin` (Task 4), `new_id` (Task 2).
- Produces: `User` with `id`, `email`, `password_hash`, `display_name`, `photo_url`, `birth_date`; `RefreshToken` with `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`. Test fixtures `db_session`, `client`, `make_user`.

- [ ] **Step 1: Write the test fixtures**

Create `apps/api/tests/conftest.py`:

```python
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.config import get_settings
from family_api.db.models.user import User
from family_api.db.session import engine_for, get_session, session_factory_for
from family_api.ids import new_id
from family_api.main import create_app
from family_api.security.passwords import hash_password


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """Each test runs in a transaction that is rolled back at teardown."""
    engine = engine_for(get_settings().test_database_url)
    connection = await engine.connect()
    transaction = await connection.begin()
    factory = session_factory_for(engine)
    session = factory(bind=connection)

    yield session

    await session.close()
    await transaction.rollback()
    await connection.close()
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    app = create_app()
    app.dependency_overrides[get_session] = lambda: db_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
def make_user(db_session: AsyncSession):
    """Factory building a valid user. Tests name only the fields they care about."""

    async def _make(
        email: str = "daniel@example.com",
        password: str = "correct-horse-battery",
        display_name: str = "Daniel",
    ) -> User:
        user = User(
            id=new_id(),
            email=email,
            password_hash=hash_password(password),
            display_name=display_name,
        )
        db_session.add(user)
        await db_session.flush()
        return user

    return _make
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/tests/integration/test_user_model.py`:

```python
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.user import User


@pytest.mark.asyncio
async def test_user_can_be_persisted(db_session: AsyncSession, make_user) -> None:
    user = await make_user(email="daniel@example.com")
    found = await db_session.scalar(select(User).where(User.id == user.id))

    assert found is not None
    assert found.display_name == "Daniel"
    assert found.created_at is not None


@pytest.mark.asyncio
async def test_email_is_case_insensitive_unique(db_session: AsyncSession, make_user) -> None:
    """CITEXT: Daniel@example.com and daniel@example.com are the same account."""
    await make_user(email="daniel@example.com")
    with pytest.raises(IntegrityError):
        await make_user(email="Daniel@example.com")


@pytest.mark.asyncio
async def test_birth_date_is_nullable_and_age_is_not_stored(make_user) -> None:
    """FR-M1-06: age is derived at read time, never stored."""
    user = await make_user()
    assert user.birth_date is None
    assert not hasattr(user, "age")
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/api && pytest tests/integration/test_user_model.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.db.models.user'`

- [ ] **Step 4: Write the models**

Create `apps/api/src/family_api/db/models/user.py`:

```python
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import CITEXT, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(CITEXT, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Age is derived from this at read time and never stored (FR-M1-06).
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # SHA-256 of the token. The raw value is never stored.
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Set on rotation, so replay of a rotated token is detectable.
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

Add to `apps/api/src/family_api/db/models/__init__.py`:

```python
from family_api.db.models.user import RefreshToken, User

__all__ = ["RefreshToken", "User"]
```

- [ ] **Step 5: Generate and review the migration**

Run: `cd apps/api && alembic revision --autogenerate -m "users"`

Rename the generated file to `0002_users.py`, set `down_revision = "0001_enums"`, and verify it creates `users` and `refresh_tokens` with the `CITEXT` email column and the unique constraints. Autogenerate does not always emit `CITEXT` correctly — if it renders `VARCHAR`, change it by hand to `postgresql.CITEXT()`.

- [ ] **Step 6: Apply the migration and run the tests**

Run: `cd apps/api && DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head && pytest tests/integration/test_user_model.py -v`
Expected: PASS — 3 tests

Note: Task 6 provides `hash_password`, which `conftest.py` imports. If executing tasks strictly in order, temporarily stub it as `lambda p: p` and remove the stub in Task 6. Otherwise complete Task 6 first.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/family_api/db/models apps/api/migrations/versions/0002_users.py apps/api/tests
git commit -m "feat(db): add user and refresh token models"
```

---

### Task 6: Password hashing and JWT tokens

**Files:**
- Create: `apps/api/src/family_api/security/__init__.py`, `apps/api/src/family_api/security/passwords.py`, `apps/api/src/family_api/security/tokens.py`
- Test: `apps/api/tests/unit/test_passwords.py`, `apps/api/tests/unit/test_tokens.py`

**Interfaces:**
- Consumes: `get_settings` (Task 1), `TokenExpiredError` (Task 3).
- Produces: `hash_password(plain: str) -> str`; `verify_password(plain: str, hashed: str) -> bool`; `create_access_token(user_id: UUID) -> str`; `decode_access_token(token: str) -> UUID`; `generate_refresh_token() -> tuple[str, str]` returning `(raw, sha256_hash)`; `hash_refresh_token(raw: str) -> str`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/unit/test_passwords.py`:

```python
from family_api.security.passwords import hash_password, verify_password


def test_hash_is_not_the_plaintext() -> None:
    hashed = hash_password("correct-horse-battery")
    assert hashed != "correct-horse-battery"
    assert hashed.startswith("$argon2id$")


def test_correct_password_verifies() -> None:
    assert verify_password("correct-horse-battery", hash_password("correct-horse-battery"))


def test_wrong_password_does_not_verify() -> None:
    assert not verify_password("wrong", hash_password("correct-horse-battery"))


def test_same_password_hashes_differently_each_time() -> None:
    """A per-hash salt means identical passwords are not identifiable in a dump."""
    assert hash_password("same") != hash_password("same")


def test_malformed_hash_returns_false_rather_than_raising() -> None:
    assert not verify_password("anything", "not-a-hash")
```

Create `apps/api/tests/unit/test_tokens.py`:

```python
from datetime import timedelta

import pytest

from family_api.errors import TokenExpiredError
from family_api.ids import new_id
from family_api.security.tokens import (
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_refresh_token,
)


def test_access_token_round_trips_the_user_id() -> None:
    user_id = new_id()
    assert decode_access_token(create_access_token(user_id)) == user_id


def test_expired_access_token_raises() -> None:
    token = create_access_token(new_id(), ttl=timedelta(seconds=-1))
    with pytest.raises(TokenExpiredError):
        decode_access_token(token)


def test_tampered_access_token_raises() -> None:
    token = create_access_token(new_id())
    with pytest.raises(TokenExpiredError):
        decode_access_token(token + "x")


def test_refresh_token_returns_raw_and_hash() -> None:
    raw, hashed = generate_refresh_token()
    assert raw != hashed
    assert hash_refresh_token(raw) == hashed


def test_refresh_tokens_are_unique() -> None:
    assert len({generate_refresh_token()[0] for _ in range(100)}) == 100
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/unit/test_passwords.py tests/unit/test_tokens.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.security'`

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/family_api/security/passwords.py`:

```python
from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error

_hasher = PasswordHasher()


def hash_password(plain: str) -> str:
    return _hasher.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _hasher.verify(hashed, plain)
    except (Argon2Error, ValueError):
        return False
```

Create `apps/api/src/family_api/security/tokens.py`:

```python
import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt

from family_api.config import get_settings
from family_api.errors import TokenExpiredError

ALGORITHM = "HS256"


def create_access_token(user_id: UUID, ttl: timedelta | None = None) -> str:
    settings = get_settings()
    if ttl is None:
        ttl = timedelta(minutes=settings.access_token_ttl_minutes)
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "iat": now, "exp": now + ttl}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> UUID:
    """Any failure is reported as expiry.

    Distinguishing "expired" from "tampered" tells an attacker whether their
    forgery was structurally valid.
    """
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
        return UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise TokenExpiredError from exc


def generate_refresh_token() -> tuple[str, str]:
    """Return (raw, hash). Only the hash is ever persisted."""
    raw = secrets.token_urlsafe(48)
    return raw, hash_refresh_token(raw)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
```

Create empty `apps/api/src/family_api/security/__init__.py`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/unit -v`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/family_api/security apps/api/tests/unit
git commit -m "feat(security): add password hashing and jwt"
```

---

### Task 7: Auth endpoints with refresh rotation and rate limiting

**Files:**
- Create: `apps/api/src/family_api/ratelimit.py`, `apps/api/src/family_api/schemas/__init__.py`, `apps/api/src/family_api/schemas/auth.py`, `apps/api/src/family_api/services/__init__.py`, `apps/api/src/family_api/services/auth.py`, `apps/api/src/family_api/security/deps.py`, `apps/api/src/family_api/routers/auth.py`
- Modify: `apps/api/src/family_api/main.py`
- Test: `apps/api/tests/integration/test_auth.py`

**Interfaces:**
- Consumes: `User`, `RefreshToken` (Task 5); password and token functions (Task 6); errors (Task 3).
- Produces: `register_user(session, email, password, display_name) -> tuple[User, TokenPair]`; `login(session, email, password) -> TokenPair`; `rotate_refresh(session, raw_token) -> TokenPair`; `revoke_refresh(session, raw_token) -> None`; `current_user` FastAPI dependency returning `User`; Pydantic `TokenPair` with `access_token: str`, `refresh_token: str`, `token_type: str = "bearer"`.

Endpoints per `docs/api-contract.md` §2.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_auth.py`:

```python
import pytest
from httpx import AsyncClient

REGISTRATION = {
    "email": "daniel@example.com",
    "password": "correct-horse-battery",
    "display_name": "Daniel",
}


@pytest.mark.asyncio
async def test_register_returns_a_token_pair(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/register", json=REGISTRATION)

    assert response.status_code == 201
    body = response.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_rejects_a_duplicate_email(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/register", json=REGISTRATION)
    response = await client.post("/api/v1/auth/register", json=REGISTRATION)

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_login_succeeds_with_correct_credentials(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/register", json=REGISTRATION)
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": REGISTRATION["email"], "password": REGISTRATION["password"]},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]


@pytest.mark.asyncio
async def test_wrong_password_and_unknown_email_are_indistinguishable(
    client: AsyncClient,
) -> None:
    """H-08: the response must not reveal whether the account exists."""
    await client.post("/api/v1/auth/register", json=REGISTRATION)

    wrong_password = await client.post(
        "/api/v1/auth/login",
        json={"email": REGISTRATION["email"], "password": "nope"},
    )
    unknown_email = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "nope"},
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


@pytest.mark.asyncio
async def test_refresh_rotates_the_token(client: AsyncClient) -> None:
    registered = await client.post("/api/v1/auth/register", json=REGISTRATION)
    original = registered.json()["refresh_token"]

    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": original})

    assert response.status_code == 200
    assert response.json()["refresh_token"] != original


@pytest.mark.asyncio
async def test_replaying_a_rotated_refresh_token_is_rejected(client: AsyncClient) -> None:
    """H-07: replay means the token leaked. Revoke the whole family."""
    registered = await client.post("/api/v1/auth/register", json=REGISTRATION)
    original = registered.json()["refresh_token"]
    rotated = await client.post("/api/v1/auth/refresh", json={"refresh_token": original})
    new_token = rotated.json()["refresh_token"]

    replay = await client.post("/api/v1/auth/refresh", json={"refresh_token": original})
    assert replay.status_code == 401
    assert replay.json()["type"] == "token_reused"

    after_revocation = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": new_token}
    )
    assert after_revocation.status_code == 401


@pytest.mark.asyncio
async def test_me_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_me_returns_the_authenticated_user(client: AsyncClient) -> None:
    registered = await client.post("/api/v1/auth/register", json=REGISTRATION)
    token = registered.json()["access_token"]

    response = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == REGISTRATION["email"]
    assert "password_hash" not in body
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_auth.py -v`
Expected: FAIL — 404 on every route

- [ ] **Step 3: Write the schemas**

Create `apps/api/src/family_api/schemas/auth.py`:

```python
from datetime import date
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """Deliberately excludes password_hash. Never widen this model."""

    id: UUID
    email: str
    display_name: str
    photo_url: str | None
    birth_date: date | None
    age: int | None
```

`EmailStr` needs `pydantic[email]`; add `email-validator>=2.2` to `pyproject.toml` dependencies.

- [ ] **Step 4: Write the rate limiter**

Create `apps/api/src/family_api/ratelimit.py`:

```python
"""In-memory fixed-window rate limiter.

Per-process, so it does not survive multiple workers. That is acceptable for a
single-household deployment; Phase 3 introduces Redis (spec §7.5) and this
moves there.
"""

import time
from collections import defaultdict

from family_api.errors import RateLimitedError

_hits: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    now = time.monotonic()
    recent = [t for t in _hits[key] if now - t < window_seconds]
    if len(recent) >= limit:
        raise RateLimitedError
    recent.append(now)
    _hits[key] = recent


def reset_rate_limits() -> None:
    """Test hook."""
    _hits.clear()
```

- [ ] **Step 5: Write the auth service**

Create `apps/api/src/family_api/services/auth.py`:

```python
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.config import get_settings
from family_api.db.models.user import RefreshToken, User
from family_api.errors import (
    AlreadyInHouseholdError,
    InvalidCredentialsError,
    TokenExpiredError,
    TokenReusedError,
)
from family_api.ids import new_id
from family_api.schemas.auth import TokenPair
from family_api.security.passwords import hash_password, verify_password
from family_api.security.tokens import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
)


async def _issue_pair(session: AsyncSession, user: User) -> TokenPair:
    raw, hashed = generate_refresh_token()
    session.add(
        RefreshToken(
            id=new_id(),
            user_id=user.id,
            token_hash=hashed,
            expires_at=datetime.now(UTC)
            + timedelta(days=get_settings().refresh_token_ttl_days),
        )
    )
    await session.flush()
    return TokenPair(access_token=create_access_token(user.id), refresh_token=raw)


async def register_user(
    session: AsyncSession, email: str, password: str, display_name: str
) -> tuple[User, TokenPair]:
    existing = await session.scalar(select(User).where(User.email == email))
    if existing is not None:
        # Reuses the 409 slug family; the API contract lists this as a conflict.
        raise AlreadyInHouseholdError
    user = User(
        id=new_id(),
        email=email,
        password_hash=hash_password(password),
        display_name=display_name,
    )
    session.add(user)
    await session.flush()
    return user, await _issue_pair(session, user)


async def login(session: AsyncSession, email: str, password: str) -> TokenPair:
    user = await session.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(password, user.password_hash):
        # Identical for unknown email and wrong password (H-08).
        raise InvalidCredentialsError
    return await _issue_pair(session, user)


async def rotate_refresh(session: AsyncSession, raw_token: str) -> TokenPair:
    hashed = hash_refresh_token(raw_token)
    stored = await session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hashed).with_for_update()
    )
    if stored is None:
        raise TokenExpiredError
    if stored.revoked_at is not None:
        # Replay of a rotated token means it leaked. Revoke the whole family.
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == stored.user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        raise TokenReusedError
    if stored.expires_at <= datetime.now(UTC):
        raise TokenExpiredError

    stored.revoked_at = datetime.now(UTC)
    user = await session.get(User, stored.user_id)
    assert user is not None
    return await _issue_pair(session, user)


async def revoke_refresh(session: AsyncSession, raw_token: str) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw_token))
        .values(revoked_at=datetime.now(UTC))
    )
```

- [ ] **Step 6: Write the auth dependency**

Create `apps/api/src/family_api/security/deps.py`:

```python
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.user import User
from family_api.db.session import get_session
from family_api.errors import TokenExpiredError
from family_api.security.tokens import decode_access_token


async def current_user(
    authorization: Annotated[str | None, Header()] = None,
    session: Annotated[AsyncSession, Depends(get_session)] = ...,  # type: ignore[assignment]
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise TokenExpiredError
    user = await session.get(User, decode_access_token(authorization.split(" ", 1)[1]))
    if user is None:
        raise TokenExpiredError
    return user


CurrentUser = Annotated[User, Depends(current_user)]
```

- [ ] **Step 7: Write the router**

Create `apps/api/src/family_api/routers/auth.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.config import get_settings
from family_api.db.session import get_session
from family_api.ratelimit import check_rate_limit
from family_api.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UserResponse,
)
from family_api.security.deps import CurrentUser
from family_api.services import auth as auth_service
from family_api.services.members import derive_age

router = APIRouter(prefix="/auth", tags=["auth"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _limit_auth(request: Request) -> None:
    settings = get_settings()
    client = request.client.host if request.client else "unknown"
    check_rate_limit(f"auth:{client}", settings.rate_limit_auth_per_minute, 60)


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, session: SessionDep, request: Request) -> TokenPair:
    _limit_auth(request)
    _, pair = await auth_service.register_user(
        session, body.email, body.password, body.display_name
    )
    await session.commit()
    return pair


@router.post("/login")
async def login(body: LoginRequest, session: SessionDep, request: Request) -> TokenPair:
    _limit_auth(request)
    pair = await auth_service.login(session, body.email, body.password)
    await session.commit()
    return pair


@router.post("/refresh")
async def refresh(body: RefreshRequest, session: SessionDep) -> TokenPair:
    pair = await auth_service.rotate_refresh(session, body.refresh_token)
    await session.commit()
    return pair


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, session: SessionDep) -> None:
    await auth_service.revoke_refresh(session, body.refresh_token)
    await session.commit()


@router.get("/me")
async def me(user: CurrentUser) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        photo_url=user.photo_url,
        birth_date=user.birth_date,
        age=derive_age(user.birth_date),
    )
```

`derive_age` is defined in Task 9. Until then, inline it in this router and move it in Task 9.

- [ ] **Step 8: Mount the router**

In `apps/api/src/family_api/main.py`:

```python
from family_api.routers import auth, health
```

```python
    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(auth.router, prefix=API_PREFIX)
```

- [ ] **Step 9: Reset rate limits between tests**

Add to `apps/api/tests/conftest.py`:

```python
@pytest.fixture(autouse=True)
def _reset_rate_limits() -> None:
    from family_api.ratelimit import reset_rate_limits

    reset_rate_limits()
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_auth.py -v`
Expected: PASS — 8 tests

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/family_api apps/api/tests
git commit -m "feat(auth): add register, login and rotation"
```

---

### Task 8: Household, membership, invite, category and visibility models

One task because they share a migration and none is independently testable — a membership without a household is meaningless.

**Files:**
- Create: `apps/api/src/family_api/db/models/household.py`, `apps/api/src/family_api/db/models/seeded.py`, `apps/api/migrations/versions/0003_households.py`
- Modify: `apps/api/src/family_api/db/models/__init__.py`
- Test: `apps/api/tests/integration/test_household_models.py`

**Interfaces:**
- Consumes: `Base`, `TimestampMixin` (Task 4), `User` (Task 5).
- Produces: `Household(id, name, currency, timezone, created_by)`; `HouseholdMember(id, household_id, user_id, role, relationship, status, joined_at)`; `InviteCode(id, household_id, code, role_granted, expires_at, max_uses, uses, revoked_at, created_by)`; `Category(id, household_id, kind, name, icon, is_system, archived_at)`; `VisibilitySetting(id, household_id, member_id, module, level, updated_at)`.

Column definitions come from `docs/data-model.md` §4, §5 and §8.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/test_household_models.py`:

```python
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.ids import new_id


async def _household(session: AsyncSession, user_id) -> Household:
    household = Household(
        id=new_id(), name="Familia Hernández", currency="COP",
        timezone="America/Bogota", created_by=user_id,
    )
    session.add(household)
    await session.flush()
    return household


@pytest.mark.asyncio
async def test_household_defaults_to_cop_and_bogota(
    db_session: AsyncSession, make_user
) -> None:
    user = await make_user()
    household = await _household(db_session, user.id)

    assert household.currency == "COP"
    assert household.timezone == "America/Bogota"


@pytest.mark.asyncio
async def test_a_user_belongs_to_at_most_one_household(
    db_session: AsyncSession, make_user
) -> None:
    """FR-M1-02, enforced by UNIQUE(user_id)."""
    user = await make_user()
    first = await _household(db_session, user.id)
    second = await _household(db_session, user.id)

    db_session.add(
        HouseholdMember(id=new_id(), household_id=first.id, user_id=user.id, role="admin")
    )
    await db_session.flush()

    db_session.add(
        HouseholdMember(id=new_id(), household_id=second.id, user_id=user.id, role="adult")
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_membership_defaults_to_active(db_session: AsyncSession, make_user) -> None:
    user = await make_user()
    household = await _household(db_session, user.id)
    member = HouseholdMember(
        id=new_id(), household_id=household.id, user_id=user.id, role="admin"
    )
    db_session.add(member)
    await db_session.flush()
    await db_session.refresh(member)

    assert member.status == "active"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pytest tests/integration/test_household_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.db.models.household'`

- [ ] **Step 3: Write the models**

Create `apps/api/src/family_api/db/models/household.py`:

```python
from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base, TimestampMixin

member_role = PgEnum("admin", "adult", "teen", "guest", name="member_role", create_type=False)
member_status = PgEnum("active", "invited", "inactive", name="member_status", create_type=False)


class Household(Base, TimestampMixin):
    __tablename__ = "households"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Immutable after creation: changing it would reinterpret every stored amount.
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="COP")
    timezone: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="America/Bogota"
    )
    created_by: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )


class HouseholdMember(Base):
    __tablename__ = "household_members"
    __table_args__ = (
        UniqueConstraint("household_id", "user_id", name="uq_member_household_user"),
        # Enforces FR-M1-02. Dropping this is the whole multi-household migration.
        UniqueConstraint("user_id", name="uq_member_user"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    # RESTRICT: deleting a user must not silently erase a family's history.
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(member_role, nullable=False)
    relationship: Mapped[str | None] = mapped_column(String(60), nullable=True)
    status: Mapped[str] = mapped_column(
        member_status, nullable=False, server_default="active"
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class InviteCode(Base):
    __tablename__ = "invite_codes"
    __table_args__ = (
        CheckConstraint("max_uses > 0", name="ck_invite_max_uses_positive"),
        CheckConstraint("uses >= 0 AND uses <= max_uses", name="ck_invite_uses_bounded"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(8), nullable=False, unique=True)
    role_granted: Mapped[str] = mapped_column(member_role, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    max_uses: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    uses: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("household_members.id"), nullable=False
    )
```

Create `apps/api/src/family_api/db/models/seeded.py`:

```python
from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from family_api.db.base import Base

category_kind = PgEnum("income", "expense", name="category_kind", create_type=False)
visibility_module = PgEnum(
    "income", "expenses", "savings", "debts", name="visibility_module", create_type=False
)
visibility_level = PgEnum(
    "private", "summary", "public", name="visibility_level", create_type=False
)


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("household_id", "kind", "name", name="uq_category_household_kind_name"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(category_kind, nullable=False)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    icon: Mapped[str | None] = mapped_column(Text, nullable=True)
    # System categories archive but never delete (FR-M2-02).
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class VisibilitySetting(Base):
    __tablename__ = "visibility_settings"
    __table_args__ = (
        UniqueConstraint("member_id", "module", name="uq_visibility_member_module"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    member_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("household_members.id", ondelete="CASCADE"),
        nullable=False,
    )
    module: Mapped[str] = mapped_column(visibility_module, nullable=False)
    level: Mapped[str] = mapped_column(visibility_level, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
```

`create_type=False` on every enum: the types already exist from migration `0001_enums`, and letting SQLAlchemy try to create them again fails.

Update `apps/api/src/family_api/db/models/__init__.py`:

```python
from family_api.db.models.household import Household, HouseholdMember, InviteCode
from family_api.db.models.seeded import Category, VisibilitySetting
from family_api.db.models.user import RefreshToken, User

__all__ = [
    "Category", "Household", "HouseholdMember", "InviteCode",
    "RefreshToken", "User", "VisibilitySetting",
]
```

- [ ] **Step 4: Generate the migration**

Run: `cd apps/api && alembic revision --autogenerate -m "households"`

Rename to `0003_households.py`, set `down_revision = "0002_users"`. **Review it carefully**: autogenerate will try to `CREATE TYPE` for the enums even with `create_type=False`. Remove any `sa.Enum(...).create(...)` calls and ensure enum columns use `postgresql.ENUM(name=..., create_type=False)`.

- [ ] **Step 5: Apply and run the tests**

Run: `cd apps/api && DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head && pytest tests/integration/test_household_models.py -v`
Expected: PASS — 3 tests

- [ ] **Step 6: Verify the migration reverses**

Run: `cd apps/api && DATABASE_URL=$TEST_DATABASE_URL alembic downgrade base && DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head`
Expected: both succeed

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/family_api/db apps/api/migrations apps/api/tests/integration/test_household_models.py
git commit -m "feat(db): add household and seeded models"
```

---

### Task 9: Household creation with category and visibility seeding

**Files:**
- Create: `apps/api/src/family_api/repositories/__init__.py`, `apps/api/src/family_api/repositories/base.py`, `apps/api/src/family_api/services/households.py`, `apps/api/src/family_api/services/members.py`, `apps/api/src/family_api/schemas/household.py`, `apps/api/src/family_api/schemas/member.py`, `apps/api/src/family_api/routers/households.py`
- Modify: `apps/api/src/family_api/main.py`, `apps/api/src/family_api/routers/auth.py`
- Test: `apps/api/tests/integration/test_households.py`

**Interfaces:**
- Consumes: models (Task 8), `CurrentUser` (Task 7), errors (Task 3).
- Produces: `create_household(session, user, name, currency, timezone) -> Household`; `seed_categories(session, household) -> None`; `seed_visibility(session, member) -> None`; `current_member(...)` dependency returning `HouseholdMember`; `CurrentMember` annotated type; `derive_age(birth_date: date | None) -> int | None`; `require_admin(member) -> None`; `SEEDED_CATEGORIES: dict[str, tuple[str, ...]]`; `DEFAULT_VISIBILITY: dict[str, str]`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_households.py`:

```python
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.seeded import Category, VisibilitySetting


async def _register(client: AsyncClient, email: str = "daniel@example.com") -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery", "display_name": "Daniel"},
    )
    return response.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_creating_a_household_makes_the_creator_admin(client: AsyncClient) -> None:
    token = await _register(client)
    response = await client.post(
        "/api/v1/households", json={"name": "Familia Hernández"}, headers=_auth(token)
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Familia Hernández"
    assert body["currency"] == "COP"
    assert body["timezone"] == "America/Bogota"
    assert body["my_role"] == "admin"


@pytest.mark.asyncio
async def test_creating_a_second_household_is_rejected(client: AsyncClient) -> None:
    """FR-M1-02."""
    token = await _register(client)
    await client.post("/api/v1/households", json={"name": "Uno"}, headers=_auth(token))
    response = await client.post(
        "/api/v1/households", json={"name": "Dos"}, headers=_auth(token)
    )

    assert response.status_code == 409
    assert response.json()["type"] == "already_in_household"


@pytest.mark.asyncio
async def test_creation_seeds_the_spec_categories(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """FR-M2-01, including the Aporte al hogar system category."""
    token = await _register(client)
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=_auth(token))

    rows = (await db_session.scalars(select(Category))).all()
    income = {c.name for c in rows if c.kind == "income"}
    expense = {c.name for c in rows if c.kind == "expense"}

    assert income == {"Salario", "Negocio", "Regalos", "Otros"}
    assert expense == {
        "Transporte", "Comida", "Educación", "Entretenimiento",
        "Salud", "Otros", "Aporte al hogar",
    }
    aporte = next(c for c in rows if c.name == "Aporte al hogar")
    assert aporte.is_system is True


@pytest.mark.asyncio
async def test_creation_seeds_visibility_with_debts_private(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """FR-M3-03: debts start closed; everything else starts at summary."""
    token = await _register(client)
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=_auth(token))

    settings = {
        s.module: s.level for s in (await db_session.scalars(select(VisibilitySetting))).all()
    }

    assert settings == {
        "income": "summary",
        "expenses": "summary",
        "savings": "summary",
        "debts": "private",
    }


@pytest.mark.asyncio
async def test_creating_a_household_requires_authentication(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/households", json={"name": "X"})).status_code == 401


@pytest.mark.asyncio
async def test_current_household_returns_members_with_derived_age(
    client: AsyncClient,
) -> None:
    """FR-M1-06: age is derived, never stored."""
    token = await _register(client)
    await client.post("/api/v1/households", json={"name": "Hogar"}, headers=_auth(token))

    response = await client.get("/api/v1/households/current", headers=_auth(token))

    assert response.status_code == 200
    member = response.json()["members"][0]
    assert member["display_name"] == "Daniel"
    assert member["role"] == "admin"
    assert "age" in member
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_households.py -v`
Expected: FAIL — 404 on `/api/v1/households`

- [ ] **Step 3: Write the household-scoped repository base**

Create `apps/api/src/family_api/repositories/base.py`:

```python
"""Household scoping applied in exactly one place (INV-D-03).

Every finance query goes through a subclass, so the scoping filter cannot be
forgotten in an individual query.
"""

from typing import Any
from uuid import UUID

from sqlalchemy import Select, select


class HouseholdScopedRepository:
    model: Any

    def __init__(self, household_id: UUID) -> None:
        self.household_id = household_id

    def query(self) -> Select[Any]:
        return select(self.model).where(self.model.household_id == self.household_id)
```

- [ ] **Step 4: Write the member helpers**

Create `apps/api/src/family_api/services/members.py`:

```python
from datetime import date
from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.user import User
from family_api.db.session import get_session
from family_api.errors import ForbiddenRoleError, NotFoundError
from family_api.security.deps import current_user


def derive_age(birth_date: date | None) -> int | None:
    """FR-M1-06. Age is a fact that rots, so it is computed, never stored."""
    if birth_date is None:
        return None
    today = date.today()
    had_birthday = (today.month, today.day) >= (birth_date.month, birth_date.day)
    return today.year - birth_date.year - (0 if had_birthday else 1)


async def current_member(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> HouseholdMember:
    member = await session.scalar(
        select(HouseholdMember).where(
            HouseholdMember.user_id == user.id, HouseholdMember.status == "active"
        )
    )
    if member is None:
        raise NotFoundError
    return member


CurrentMember = Annotated[HouseholdMember, Depends(current_member)]


def require_admin(member: HouseholdMember) -> None:
    """Admin is a logistics role. It never grants visibility into finances."""
    if member.role != "admin":
        raise ForbiddenRoleError
```

- [ ] **Step 5: Write the household service**

Create `apps/api/src/family_api/services/households.py`:

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.config import get_settings
from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.seeded import Category, VisibilitySetting
from family_api.db.models.user import User
from family_api.errors import AlreadyInHouseholdError
from family_api.ids import new_id

# FR-M2-01. Seeded data stays in the user's language (docs/glossary.md §6).
SEEDED_CATEGORIES: dict[str, tuple[str, ...]] = {
    "income": ("Salario", "Negocio", "Regalos", "Otros"),
    "expense": (
        "Transporte", "Comida", "Educación", "Entretenimiento", "Salud", "Otros",
    ),
}

# The category FR-M4-05 assigns to the expense a contribution generates.
CONTRIBUTION_CATEGORY = "Aporte al hogar"

# FR-M3-03. Debt is the most stigmatized financial fact in a family.
DEFAULT_VISIBILITY: dict[str, str] = {
    "income": "summary",
    "expenses": "summary",
    "savings": "summary",
    "debts": "private",
}


def seed_categories(session: AsyncSession, household: Household) -> None:
    for kind, names in SEEDED_CATEGORIES.items():
        for name in names:
            session.add(
                Category(
                    id=new_id(), household_id=household.id, kind=kind,
                    name=name, is_system=True,
                )
            )
    session.add(
        Category(
            id=new_id(), household_id=household.id, kind="expense",
            name=CONTRIBUTION_CATEGORY, is_system=True,
        )
    )


def seed_visibility(session: AsyncSession, member: HouseholdMember) -> None:
    for module, level in DEFAULT_VISIBILITY.items():
        session.add(
            VisibilitySetting(
                id=new_id(), household_id=member.household_id,
                member_id=member.id, module=module, level=level,
            )
        )


async def assert_not_in_household(session: AsyncSession, user: User) -> None:
    existing = await session.scalar(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    )
    if existing is not None:
        raise AlreadyInHouseholdError


async def create_household(
    session: AsyncSession,
    user: User,
    name: str,
    currency: str | None = None,
    timezone: str | None = None,
) -> tuple[Household, HouseholdMember]:
    await assert_not_in_household(session, user)
    settings = get_settings()

    household = Household(
        id=new_id(), name=name,
        currency=currency or settings.default_currency,
        timezone=timezone or settings.default_timezone,
        created_by=user.id,
    )
    session.add(household)
    await session.flush()

    member = HouseholdMember(
        id=new_id(), household_id=household.id, user_id=user.id,
        role="admin", status="active",
    )
    session.add(member)
    await session.flush()

    seed_categories(session, household)
    seed_visibility(session, member)
    await session.flush()
    return household, member
```

- [ ] **Step 6: Write the schemas**

Create `apps/api/src/family_api/schemas/member.py`:

```python
from uuid import UUID

from pydantic import BaseModel


class MemberResponse(BaseModel):
    id: UUID
    display_name: str
    photo_url: str | None
    relationship: str | None
    role: str
    status: str
    age: int | None
```

Create `apps/api/src/family_api/schemas/household.py`:

```python
from uuid import UUID

from pydantic import BaseModel, Field

from family_api.schemas.member import MemberResponse


class CreateHouseholdRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    timezone: str | None = None


class HouseholdResponse(BaseModel):
    id: UUID
    name: str
    currency: str
    timezone: str
    my_role: str


class HouseholdDetailResponse(HouseholdResponse):
    members: list[MemberResponse]
```

- [ ] **Step 7: Write the router**

Create `apps/api/src/family_api/routers/households.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.user import User
from family_api.db.session import get_session
from family_api.errors import NotFoundError
from family_api.schemas.household import (
    CreateHouseholdRequest, HouseholdDetailResponse, HouseholdResponse,
)
from family_api.schemas.member import MemberResponse
from family_api.security.deps import CurrentUser
from family_api.services import households as household_service
from family_api.services.members import CurrentMember, derive_age

router = APIRouter(prefix="/households", tags=["households"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(
    body: CreateHouseholdRequest, user: CurrentUser, session: SessionDep
) -> HouseholdResponse:
    household, member = await household_service.create_household(
        session, user, body.name, body.currency, body.timezone
    )
    await session.commit()
    return HouseholdResponse(
        id=household.id, name=household.name, currency=household.currency,
        timezone=household.timezone, my_role=member.role,
    )


@router.get("/current")
async def current(member: CurrentMember, session: SessionDep) -> HouseholdDetailResponse:
    household = await session.get(Household, member.household_id)
    if household is None:
        raise NotFoundError

    rows = (
        await session.execute(
            select(HouseholdMember, User)
            .join(User, User.id == HouseholdMember.user_id)
            .where(HouseholdMember.household_id == household.id)
        )
    ).all()

    return HouseholdDetailResponse(
        id=household.id, name=household.name, currency=household.currency,
        timezone=household.timezone, my_role=member.role,
        members=[
            MemberResponse(
                id=m.id, display_name=u.display_name, photo_url=u.photo_url,
                relationship=m.relationship, role=m.role, status=m.status,
                age=derive_age(u.birth_date),
            )
            for m, u in rows
        ],
    )
```

- [ ] **Step 8: Mount the router and move `derive_age`**

In `main.py` add `households` to the router imports and `app.include_router(households.router, prefix=API_PREFIX)`.

In `routers/auth.py`, remove any inlined `derive_age` and import it from `family_api.services.members`.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration -v`
Expected: PASS — all integration tests including 6 new ones

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/integration/test_households.py
git commit -m "feat(household): add creation with seeding"
```

---

### Task 10: Invite code generation and issuance

**Files:**
- Create: `apps/api/src/family_api/services/invites.py`, `apps/api/src/family_api/schemas/invite.py`
- Modify: `apps/api/src/family_api/routers/households.py`
- Test: `apps/api/tests/unit/test_invite_codes.py`, `apps/api/tests/integration/test_invites.py`

**Interfaces:**
- Consumes: `InviteCode`, `HouseholdMember` (Task 8), `require_admin`, `CurrentMember` (Task 9).
- Produces: `INVITE_ALPHABET: str`; `generate_code() -> str`; `issue_invite(session, member, role_granted, expires_in_days, max_uses) -> InviteCode`; `list_invites(session, member) -> list[InviteCode]`; `revoke_invite(session, member, invite_id) -> None`.

- [ ] **Step 1: Write the failing unit tests**

Create `apps/api/tests/unit/test_invite_codes.py`:

```python
from family_api.services.invites import INVITE_ALPHABET, generate_code

AMBIGUOUS = set("0O1IL")


def test_code_is_eight_characters() -> None:
    assert len(generate_code()) == 8


def test_alphabet_excludes_ambiguous_glyphs() -> None:
    """FR-M1-03: codes get read aloud across a room."""
    assert not (set(INVITE_ALPHABET) & AMBIGUOUS)


def test_generated_codes_use_only_the_alphabet() -> None:
    assert all(set(generate_code()) <= set(INVITE_ALPHABET) for _ in range(200))


def test_codes_are_uppercase() -> None:
    assert generate_code() == generate_code().upper()


def test_codes_are_not_trivially_repeating() -> None:
    assert len({generate_code() for _ in range(500)}) > 490
```

- [ ] **Step 2: Write the failing integration tests**

Create `apps/api/tests/integration/test_invites.py`:

```python
import pytest
from httpx import AsyncClient


async def _admin_with_household(client: AsyncClient) -> str:
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


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_admin_can_issue_an_invite(client: AsyncClient) -> None:
    token = await _admin_with_household(client)
    response = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=_auth(token),
    )

    assert response.status_code == 201
    body = response.json()
    assert len(body["code"]) == 8
    assert body["role_granted"] == "adult"
    assert body["max_uses"] == 1
    assert body["expires_at"]


@pytest.mark.asyncio
async def test_admin_can_list_invites(client: AsyncClient) -> None:
    token = await _admin_with_household(client)
    await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "teen"},
        headers=_auth(token),
    )

    response = await client.get("/api/v1/households/current/invites", headers=_auth(token))

    assert response.status_code == 200
    assert len(response.json()) == 1


@pytest.mark.asyncio
async def test_revoking_an_invite_is_irreversible(client: AsyncClient) -> None:
    token = await _admin_with_household(client)
    created = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=_auth(token),
    )
    invite_id = created.json()["id"]

    deleted = await client.delete(
        f"/api/v1/households/current/invites/{invite_id}", headers=_auth(token)
    )
    assert deleted.status_code == 204

    listed = await client.get("/api/v1/households/current/invites", headers=_auth(token))
    assert listed.json()[0]["revoked_at"] is not None
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/unit/test_invite_codes.py tests/integration/test_invites.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'family_api.services.invites'`

- [ ] **Step 4: Write the schemas**

Create `apps/api/src/family_api/schemas/invite.py`:

```python
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateInviteRequest(BaseModel):
    role_granted: Literal["admin", "adult", "teen", "guest"]
    expires_in_days: int = Field(default=7, ge=1, le=90)
    max_uses: int = Field(default=1, ge=1, le=20)


class InviteResponse(BaseModel):
    id: UUID
    code: str
    role_granted: str
    expires_at: datetime
    max_uses: int
    uses: int
    revoked_at: datetime | None


class JoinHouseholdRequest(BaseModel):
    code: str = Field(min_length=8, max_length=8)
```

- [ ] **Step 5: Write the service**

Create `apps/api/src/family_api/services/invites.py`:

```python
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember, InviteCode
from family_api.errors import NotFoundError
from family_api.ids import new_id
from family_api.services.members import require_admin

# FR-M1-03: excludes 0 O 1 I L so a code can be read aloud across a room.
INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8


def generate_code() -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(CODE_LENGTH))


async def issue_invite(
    session: AsyncSession,
    member: HouseholdMember,
    role_granted: str,
    expires_in_days: int = 7,
    max_uses: int = 1,
) -> InviteCode:
    require_admin(member)
    invite = InviteCode(
        id=new_id(),
        household_id=member.household_id,
        code=generate_code(),
        role_granted=role_granted,
        expires_at=datetime.now(UTC) + timedelta(days=expires_in_days),
        max_uses=max_uses,
        uses=0,
        created_by=member.id,
    )
    session.add(invite)
    await session.flush()
    return invite


async def list_invites(
    session: AsyncSession, member: HouseholdMember
) -> list[InviteCode]:
    require_admin(member)
    rows = await session.scalars(
        select(InviteCode).where(InviteCode.household_id == member.household_id)
    )
    return list(rows)


async def revoke_invite(
    session: AsyncSession, member: HouseholdMember, invite_id: UUID
) -> None:
    require_admin(member)
    invite = await session.scalar(
        select(InviteCode).where(
            InviteCode.id == invite_id, InviteCode.household_id == member.household_id
        )
    )
    if invite is None:
        raise NotFoundError
    if invite.revoked_at is None:
        invite.revoked_at = datetime.now(UTC)
    await session.flush()
```

- [ ] **Step 6: Add the routes**

Append to `apps/api/src/family_api/routers/households.py`:

```python
from uuid import UUID as UUIDType

from family_api.schemas.invite import CreateInviteRequest, InviteResponse
from family_api.services import invites as invite_service


@router.post("/current/invites", status_code=status.HTTP_201_CREATED)
async def create_invite(
    body: CreateInviteRequest, member: CurrentMember, session: SessionDep
) -> InviteResponse:
    invite = await invite_service.issue_invite(
        session, member, body.role_granted, body.expires_in_days, body.max_uses
    )
    await session.commit()
    return InviteResponse.model_validate(invite, from_attributes=True)


@router.get("/current/invites")
async def list_invites(member: CurrentMember, session: SessionDep) -> list[InviteResponse]:
    rows = await invite_service.list_invites(session, member)
    return [InviteResponse.model_validate(r, from_attributes=True) for r in rows]


@router.delete("/current/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(
    invite_id: UUIDType, member: CurrentMember, session: SessionDep
) -> None:
    await invite_service.revoke_invite(session, member, invite_id)
    await session.commit()
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/unit/test_invite_codes.py tests/integration/test_invites.py -v`
Expected: PASS — 8 tests

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/family_api apps/api/tests
git commit -m "feat(invites): add code generation and issuance"
```

---

### Task 11: Joining a household

The concurrency-sensitive task. `SELECT ... FOR UPDATE` plus the `CHECK` constraint from Task 8 are what keep `uses` inside `max_uses` under simultaneous redemption (INV-D-05).

**Files:**
- Modify: `apps/api/src/family_api/services/invites.py`, `apps/api/src/family_api/routers/households.py`
- Test: `apps/api/tests/integration/test_join.py`

**Interfaces:**
- Consumes: `issue_invite`, `generate_code` (Task 10); `seed_visibility`, `assert_not_in_household` (Task 9).
- Produces: `redeem_invite(session, user, code) -> HouseholdMember`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_join.py`:

```python
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.seeded import VisibilitySetting


async def _register(client: AsyncClient, email: str, name: str) -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery", "display_name": name},
    )
    return response.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _household_with_invite(client: AsyncClient, role: str = "adult") -> tuple[str, str]:
    admin = await _register(client, "daniel@example.com", "Daniel")
    await client.post(
        "/api/v1/households", json={"name": "Familia Hernández"}, headers=_auth(admin)
    )
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": role},
        headers=_auth(admin),
    )
    return admin, invite.json()["code"]


@pytest.mark.asyncio
async def test_joining_with_a_valid_code_grants_the_coded_role(client: AsyncClient) -> None:
    _, code = await _household_with_invite(client, role="adult")
    papa = await _register(client, "papa@example.com", "Papá")

    response = await client.post(
        "/api/v1/households/join", json={"code": code}, headers=_auth(papa)
    )

    assert response.status_code == 201
    assert response.json()["my_role"] == "adult"


@pytest.mark.asyncio
async def test_joining_seeds_visibility_defaults(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """FR-M3-03 applies on join, not only on creation."""
    _, code = await _household_with_invite(client)
    papa = await _register(client, "papa@example.com", "Papá")
    await client.post("/api/v1/households/join", json={"code": code}, headers=_auth(papa))

    rows = (await db_session.scalars(select(VisibilitySetting))).all()
    per_member: dict[str, dict[str, str]] = {}
    for row in rows:
        per_member.setdefault(str(row.member_id), {})[row.module] = row.level

    assert len(per_member) == 2
    for settings in per_member.values():
        assert settings["debts"] == "private"
        assert settings["income"] == "summary"


@pytest.mark.asyncio
async def test_unknown_code_is_rejected(client: AsyncClient) -> None:
    papa = await _register(client, "papa@example.com", "Papá")
    response = await client.post(
        "/api/v1/households/join", json={"code": "ZZZZZZZZ"}, headers=_auth(papa)
    )

    assert response.status_code == 400
    assert response.json()["type"] == "invite_not_found"


@pytest.mark.asyncio
async def test_revoked_code_is_rejected(client: AsyncClient) -> None:
    admin, code = await _household_with_invite(client)
    listed = await client.get("/api/v1/households/current/invites", headers=_auth(admin))
    await client.delete(
        f"/api/v1/households/current/invites/{listed.json()[0]['id']}", headers=_auth(admin)
    )

    papa = await _register(client, "papa@example.com", "Papá")
    response = await client.post(
        "/api/v1/households/join", json={"code": code}, headers=_auth(papa)
    )

    assert response.status_code == 400
    assert response.json()["type"] == "invite_revoked"


@pytest.mark.asyncio
async def test_exhausted_code_is_rejected(client: AsyncClient) -> None:
    """max_uses defaults to 1, so the second redemption must fail."""
    _, code = await _household_with_invite(client)
    papa = await _register(client, "papa@example.com", "Papá")
    await client.post("/api/v1/households/join", json={"code": code}, headers=_auth(papa))

    mama = await _register(client, "mama@example.com", "Mamá")
    response = await client.post(
        "/api/v1/households/join", json={"code": code}, headers=_auth(mama)
    )

    assert response.status_code == 400
    assert response.json()["type"] == "invite_exhausted"


@pytest.mark.asyncio
async def test_a_member_cannot_join_a_second_household(client: AsyncClient) -> None:
    _, code = await _household_with_invite(client)
    papa = await _register(client, "papa@example.com", "Papá")
    await client.post("/api/v1/households/join", json={"code": code}, headers=_auth(papa))

    response = await client.post(
        "/api/v1/households/join", json={"code": code}, headers=_auth(papa)
    )
    assert response.status_code == 409
    assert response.json()["type"] == "already_in_household"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_join.py -v`
Expected: FAIL — 404 on `/api/v1/households/join`

- [ ] **Step 3: Write the redemption service**

Append to `apps/api/src/family_api/services/invites.py`:

```python
from family_api.db.models.user import User
from family_api.errors import (
    InviteExhaustedError, InviteExpiredError, InviteNotFoundError, InviteRevokedError,
)
from family_api.services.households import assert_not_in_household, seed_visibility


async def redeem_invite(session: AsyncSession, user: User, code: str) -> HouseholdMember:
    await assert_not_in_household(session, user)

    # FOR UPDATE serializes concurrent redemptions of the same code (INV-D-05).
    # The CHECK constraint on (uses <= max_uses) is the backstop if this is
    # ever bypassed.
    invite = await session.scalar(
        select(InviteCode).where(InviteCode.code == code.upper()).with_for_update()
    )
    if invite is None:
        raise InviteNotFoundError
    if invite.revoked_at is not None:
        raise InviteRevokedError
    if invite.expires_at <= datetime.now(UTC):
        raise InviteExpiredError
    if invite.uses >= invite.max_uses:
        raise InviteExhaustedError

    invite.uses += 1
    member = HouseholdMember(
        id=new_id(),
        household_id=invite.household_id,
        user_id=user.id,
        role=invite.role_granted,
        status="active",
    )
    session.add(member)
    await session.flush()

    seed_visibility(session, member)
    await session.flush()
    return member
```

- [ ] **Step 4: Add the route**

Append to `apps/api/src/family_api/routers/households.py`:

```python
from family_api.config import get_settings
from family_api.ratelimit import check_rate_limit
from family_api.schemas.invite import JoinHouseholdRequest
from fastapi import Request


@router.post("/join", status_code=status.HTTP_201_CREATED)
async def join(
    body: JoinHouseholdRequest, user: CurrentUser, session: SessionDep, request: Request
) -> HouseholdResponse:
    # The household's front door. Rate limited hard.
    client_host = request.client.host if request.client else "unknown"
    check_rate_limit(f"join:{client_host}", get_settings().rate_limit_invite_per_hour, 3600)

    member = await invite_service.redeem_invite(session, user, body.code)
    household = await session.get(Household, member.household_id)
    assert household is not None
    await session.commit()
    return HouseholdResponse(
        id=household.id, name=household.name, currency=household.currency,
        timezone=household.timezone, my_role=member.role,
    )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_join.py -v`
Expected: PASS — 6 tests

- [ ] **Step 6: Write the concurrency test**

This one needs real commits, so it uses its own engine rather than the rolled-back `db_session`. Create `apps/api/tests/integration/test_invite_concurrency.py`:

```python
import asyncio

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from family_api.config import get_settings
from family_api.db.models.household import Household, HouseholdMember, InviteCode
from family_api.db.models.seeded import Category, VisibilitySetting
from family_api.db.models.user import User
from family_api.db.session import engine_for, session_factory_for
from family_api.errors import InviteExhaustedError
from family_api.services.invites import redeem_invite


@pytest.mark.asyncio
async def test_concurrent_redemption_never_exceeds_max_uses(seeded_invite) -> None:
    """H-02 / INV-D-05: one succeeds, one is rejected. `uses` never exceeds 1."""
    code, joiner_ids = seeded_invite
    engine = engine_for(get_settings().test_database_url)
    factory = session_factory_for(engine)

    async def attempt(user_id) -> str:
        async with factory() as session:
            user = await session.get(User, user_id)
            assert user is not None
            try:
                await redeem_invite(session, user, code)
                await session.commit()
                return "ok"
            except (InviteExhaustedError, IntegrityError):
                await session.rollback()
                return "rejected"

    results = await asyncio.gather(*(attempt(uid) for uid in joiner_ids))

    assert sorted(results) == ["ok", "rejected"]

    async with factory() as session:
        invite = await session.scalar(select(InviteCode).where(InviteCode.code == code))
        assert invite is not None
        assert invite.uses == 1
    await engine.dispose()
```

Add the `seeded_invite` fixture to `apps/api/tests/conftest.py`. It commits real rows and cleans them up afterwards:

```python
@pytest_asyncio.fixture
async def seeded_invite():
    """Committed household + invite + two candidate joiners, cleaned up after."""
    from datetime import UTC, datetime, timedelta

    from family_api.db.models.household import Household, HouseholdMember, InviteCode
    from family_api.db.models.seeded import Category, VisibilitySetting
    from family_api.services.households import create_household

    engine = engine_for(get_settings().test_database_url)
    factory = session_factory_for(engine)

    async with factory() as session:
        admin = User(
            id=new_id(), email="admin-conc@example.com",
            password_hash=hash_password("correct-horse-battery"), display_name="Admin",
        )
        session.add(admin)
        await session.flush()
        household, member = await create_household(session, admin, "Concurrency")

        invite = InviteCode(
            id=new_id(), household_id=household.id, code="ABCDEFGH",
            role_granted="adult", expires_at=datetime.now(UTC) + timedelta(days=7),
            max_uses=1, uses=0, created_by=member.id,
        )
        session.add(invite)

        joiners = []
        for i in range(2):
            u = User(
                id=new_id(), email=f"joiner{i}-conc@example.com",
                password_hash=hash_password("correct-horse-battery"),
                display_name=f"Joiner {i}",
            )
            session.add(u)
            joiners.append(u.id)
        await session.commit()
        household_id = household.id

    yield "ABCDEFGH", joiners

    async with factory() as session:
        await session.execute(delete(VisibilitySetting).where(
            VisibilitySetting.household_id == household_id))
        await session.execute(delete(HouseholdMember).where(
            HouseholdMember.household_id == household_id))
        await session.execute(delete(InviteCode).where(
            InviteCode.household_id == household_id))
        await session.execute(delete(Category).where(Category.household_id == household_id))
        await session.execute(delete(Household).where(Household.id == household_id))
        await session.execute(delete(User).where(User.id.in_([admin.id, *joiners])))
        await session.commit()
    await engine.dispose()
```

Add `from sqlalchemy import delete` to the conftest imports.

- [ ] **Step 7: Run the concurrency test**

Run: `cd apps/api && pytest tests/integration/test_invite_concurrency.py -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/family_api apps/api/tests
git commit -m "feat(invites): add household join with locking"
```

---

### Task 12: Member management and the last-admin invariant

**Files:**
- Modify: `apps/api/src/family_api/services/members.py`, `apps/api/src/family_api/routers/households.py`, `apps/api/src/family_api/schemas/member.py`
- Test: `apps/api/tests/integration/test_members.py`

**Interfaces:**
- Consumes: `require_admin`, `CurrentMember` (Task 9).
- Produces: `update_member(session, actor, member_id, role, relationship) -> HouseholdMember`; `deactivate_member(session, actor, member_id) -> None`; `assert_not_last_admin(session, household_id, member_id) -> None`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/integration/test_members.py`:

```python
import pytest
from httpx import AsyncClient


async def _register(client: AsyncClient, email: str, name: str) -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery", "display_name": name},
    )
    return response.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _household_with_two_members(client: AsyncClient) -> tuple[str, str, str]:
    """Returns (admin_token, papa_token, papa_member_id)."""
    admin = await _register(client, "daniel@example.com", "Daniel")
    await client.post(
        "/api/v1/households", json={"name": "Familia Hernández"}, headers=_auth(admin)
    )
    invite = await client.post(
        "/api/v1/households/current/invites",
        json={"role_granted": "adult"},
        headers=_auth(admin),
    )
    papa = await _register(client, "papa@example.com", "Papá")
    await client.post(
        "/api/v1/households/join",
        json={"code": invite.json()["code"]},
        headers=_auth(papa),
    )
    listed = await client.get("/api/v1/households/current", headers=_auth(admin))
    papa_id = next(m["id"] for m in listed.json()["members"] if m["display_name"] == "Papá")
    return admin, papa, papa_id


@pytest.mark.asyncio
async def test_admin_can_set_a_relationship_label(client: AsyncClient) -> None:
    admin, _, papa_id = await _household_with_two_members(client)

    response = await client.patch(
        f"/api/v1/households/current/members/{papa_id}",
        json={"relationship": "Padre"},
        headers=_auth(admin),
    )

    assert response.status_code == 200
    assert response.json()["relationship"] == "Padre"


@pytest.mark.asyncio
async def test_admin_can_change_a_role(client: AsyncClient) -> None:
    admin, _, papa_id = await _household_with_two_members(client)

    response = await client.patch(
        f"/api/v1/households/current/members/{papa_id}",
        json={"role": "teen"},
        headers=_auth(admin),
    )

    assert response.status_code == 200
    assert response.json()["role"] == "teen"


@pytest.mark.asyncio
async def test_non_admin_cannot_change_roles(client: AsyncClient) -> None:
    admin, papa, papa_id = await _household_with_two_members(client)

    response = await client.patch(
        f"/api/v1/households/current/members/{papa_id}",
        json={"role": "admin"},
        headers=_auth(papa),
    )

    assert response.status_code == 403
    assert response.json()["type"] == "forbidden_role"


@pytest.mark.asyncio
async def test_the_last_admin_cannot_be_demoted(client: AsyncClient) -> None:
    """INV-R-01 / H-01."""
    admin, _, _ = await _household_with_two_members(client)
    listed = await client.get("/api/v1/households/current", headers=_auth(admin))
    admin_id = next(m["id"] for m in listed.json()["members"] if m["role"] == "admin")

    response = await client.patch(
        f"/api/v1/households/current/members/{admin_id}",
        json={"role": "adult"},
        headers=_auth(admin),
    )

    assert response.status_code == 409
    assert response.json()["type"] == "last_admin"


@pytest.mark.asyncio
async def test_the_last_admin_cannot_be_deactivated(client: AsyncClient) -> None:
    admin, _, _ = await _household_with_two_members(client)
    listed = await client.get("/api/v1/households/current", headers=_auth(admin))
    admin_id = next(m["id"] for m in listed.json()["members"] if m["role"] == "admin")

    response = await client.delete(
        f"/api/v1/households/current/members/{admin_id}", headers=_auth(admin)
    )

    assert response.status_code == 409
    assert response.json()["type"] == "last_admin"


@pytest.mark.asyncio
async def test_a_second_admin_makes_demotion_possible(client: AsyncClient) -> None:
    admin, _, papa_id = await _household_with_two_members(client)
    await client.patch(
        f"/api/v1/households/current/members/{papa_id}",
        json={"role": "admin"},
        headers=_auth(admin),
    )
    listed = await client.get("/api/v1/households/current", headers=_auth(admin))
    admin_id = next(
        m["id"] for m in listed.json()["members"] if m["display_name"] == "Daniel"
    )

    response = await client.patch(
        f"/api/v1/households/current/members/{admin_id}",
        json={"role": "adult"},
        headers=_auth(admin),
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_deactivation_keeps_the_member_listed(client: AsyncClient) -> None:
    """INV-R-03: deactivation removes access, it does not erase history."""
    admin, _, papa_id = await _household_with_two_members(client)
    await client.delete(
        f"/api/v1/households/current/members/{papa_id}", headers=_auth(admin)
    )

    listed = await client.get("/api/v1/households/current", headers=_auth(admin))
    papa = next(m for m in listed.json()["members"] if m["id"] == papa_id)

    assert papa["status"] == "inactive"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && pytest tests/integration/test_members.py -v`
Expected: FAIL — 405 or 404 on the PATCH route

- [ ] **Step 3: Add the request schema**

Append to `apps/api/src/family_api/schemas/member.py`:

```python
from typing import Literal


class UpdateMemberRequest(BaseModel):
    role: Literal["admin", "adult", "teen", "guest"] | None = None
    relationship: str | None = None
```

- [ ] **Step 4: Write the service functions**

Append to `apps/api/src/family_api/services/members.py`:

```python
from uuid import UUID

from sqlalchemy import func

from family_api.db.models.household import Household
from family_api.errors import LastAdminError


async def assert_not_last_admin(
    session: AsyncSession, household_id: UUID, member_id: UUID
) -> None:
    """INV-R-01.

    A partial unique index cannot express "at least one", so this runs inside
    the caller's transaction with the household row locked, which serializes
    two admins demoting each other simultaneously.
    """
    await session.execute(
        select(Household.id).where(Household.id == household_id).with_for_update()
    )
    remaining = await session.scalar(
        select(func.count())
        .select_from(HouseholdMember)
        .where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.role == "admin",
            HouseholdMember.status == "active",
            HouseholdMember.id != member_id,
        )
    )
    if not remaining:
        raise LastAdminError


async def _load_member(
    session: AsyncSession, actor: HouseholdMember, member_id: UUID
) -> HouseholdMember:
    member = await session.scalar(
        select(HouseholdMember).where(
            HouseholdMember.id == member_id,
            HouseholdMember.household_id == actor.household_id,
        )
    )
    if member is None:
        raise NotFoundError
    return member


async def update_member(
    session: AsyncSession,
    actor: HouseholdMember,
    member_id: UUID,
    role: str | None,
    relationship: str | None,
) -> HouseholdMember:
    require_admin(actor)
    member = await _load_member(session, actor, member_id)

    if role is not None and role != member.role and member.role == "admin":
        await assert_not_last_admin(session, actor.household_id, member.id)
    if role is not None:
        member.role = role
    if relationship is not None:
        member.relationship = relationship

    await session.flush()
    return member


async def deactivate_member(
    session: AsyncSession, actor: HouseholdMember, member_id: UUID
) -> None:
    """INV-R-03: records are retained and stay attributed."""
    require_admin(actor)
    member = await _load_member(session, actor, member_id)
    if member.role == "admin":
        await assert_not_last_admin(session, actor.household_id, member.id)
    member.status = "inactive"
    await session.flush()
```

- [ ] **Step 5: Add the routes**

Append to `apps/api/src/family_api/routers/households.py`:

```python
from family_api.schemas.member import UpdateMemberRequest
from family_api.services import members as member_service


@router.patch("/current/members/{member_id}")
async def update_member(
    member_id: UUIDType,
    body: UpdateMemberRequest,
    member: CurrentMember,
    session: SessionDep,
) -> MemberResponse:
    updated = await member_service.update_member(
        session, member, member_id, body.role, body.relationship
    )
    user = await session.get(User, updated.user_id)
    assert user is not None
    await session.commit()
    return MemberResponse(
        id=updated.id, display_name=user.display_name, photo_url=user.photo_url,
        relationship=updated.relationship, role=updated.role, status=updated.status,
        age=derive_age(user.birth_date),
    )


@router.delete("/current/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_member(
    member_id: UUIDType, member: CurrentMember, session: SessionDep
) -> None:
    await member_service.deactivate_member(session, member, member_id)
    await session.commit()
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_members.py -v`
Expected: PASS — 7 tests

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/integration/test_members.py
git commit -m "feat(members): add role updates and admin guard"
```

---

### Task 13: Profile editing

**Files:**
- Modify: `apps/api/src/family_api/routers/auth.py`, `apps/api/src/family_api/schemas/auth.py`
- Test: `apps/api/tests/integration/test_profile.py`

**Interfaces:**
- Consumes: `CurrentUser` (Task 7), `derive_age` (Task 9).
- Produces: `UpdateProfileRequest` with `display_name`, `photo_url`, `birth_date`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/test_profile.py`:

```python
import pytest
from httpx import AsyncClient


async def _register(client: AsyncClient) -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "daniel@example.com",
            "password": "correct-horse-battery",
            "display_name": "Daniel",
        },
    )
    return response.json()["access_token"]


@pytest.mark.asyncio
async def test_member_can_edit_their_own_profile(client: AsyncClient) -> None:
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.patch(
        "/api/v1/me/profile",
        json={"display_name": "Daniel H.", "birth_date": "2003-05-14"},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["display_name"] == "Daniel H."
    assert body["birth_date"] == "2003-05-14"


@pytest.mark.asyncio
async def test_age_is_derived_from_birth_date(client: AsyncClient) -> None:
    """FR-M1-06: the response carries an age, the database does not."""
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    await client.patch(
        "/api/v1/me/profile", json={"birth_date": "2000-01-01"}, headers=headers
    )

    response = await client.get("/api/v1/auth/me", headers=headers)

    assert response.json()["age"] >= 25


@pytest.mark.asyncio
async def test_profile_edit_requires_authentication(client: AsyncClient) -> None:
    response = await client.patch("/api/v1/me/profile", json={"display_name": "X"})
    assert response.status_code == 401
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pytest tests/integration/test_profile.py -v`
Expected: FAIL — 404 on `/api/v1/me/profile`

- [ ] **Step 3: Add the schema**

Append to `apps/api/src/family_api/schemas/auth.py`:

```python
class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    photo_url: str | None = None
    birth_date: date | None = None
```

- [ ] **Step 4: Add the route**

Append to `apps/api/src/family_api/routers/auth.py`. Note the different prefix — this router is mounted at `/auth`, so add a second router object at the bottom of the file:

```python
from family_api.schemas.auth import UpdateProfileRequest

me_router = APIRouter(prefix="/me", tags=["profile"])


@me_router.patch("/profile")
async def update_profile(
    body: UpdateProfileRequest, user: CurrentUser, session: SessionDep
) -> UserResponse:
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.photo_url is not None:
        user.photo_url = body.photo_url
    if body.birth_date is not None:
        user.birth_date = body.birth_date
    await session.commit()
    return UserResponse(
        id=user.id, email=user.email, display_name=user.display_name,
        photo_url=user.photo_url, birth_date=user.birth_date,
        age=derive_age(user.birth_date),
    )
```

In `main.py`, mount it: `app.include_router(auth.me_router, prefix=API_PREFIX)`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_profile.py -v`
Expected: PASS — 3 tests

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/family_api apps/api/tests/integration/test_profile.py
git commit -m "feat(profile): add self profile editing"
```

---

### Task 14: Seed script and full-suite verification

**Files:**
- Create: `apps/api/scripts/seed.py`
- Test: `apps/api/tests/integration/test_seed.py`

**Interfaces:**
- Consumes: everything above.
- Produces: `seed_demo_household(session) -> None`; a runnable `make seed`.

Builds the Familia Hernández household from spec §1.1 with mixed visibility settings, so the privacy behaviour is visible the moment the app opens rather than something a developer has to construct by hand.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/test_seed.py`:

```python
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.seeded import VisibilitySetting

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from seed import seed_demo_household  # noqa: E402


@pytest.mark.asyncio
async def test_seed_creates_the_spec_household(db_session: AsyncSession) -> None:
    await seed_demo_household(db_session)

    household = await db_session.scalar(select(Household))
    assert household is not None
    assert household.name == "Familia Hernández"
    assert household.currency == "COP"

    members = (await db_session.scalars(select(HouseholdMember))).all()
    assert len(members) == 4
    assert sum(1 for m in members if m.role == "admin") == 1
    assert {m.relationship for m in members} == {"Hijo", "Padre", "Madre", "Hermano"}


@pytest.mark.asyncio
async def test_seed_produces_mixed_visibility(db_session: AsyncSession) -> None:
    """Every level appears, so all three render paths are exercised on first run."""
    await seed_demo_household(db_session)

    levels = {
        s.level for s in (await db_session.scalars(select(VisibilitySetting))).all()
    }
    assert levels == {"private", "summary", "public"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pytest tests/integration/test_seed.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'seed'`

- [ ] **Step 3: Write the seed script**

Create `apps/api/scripts/seed.py`:

```python
"""Build the Familia Hernández demo household from spec §1.1.

Run with `make seed` (`cd apps/api && python scripts/seed.py`). Idempotent: it
does nothing if the household exists.
"""

import asyncio

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.seeded import VisibilitySetting
from family_api.db.models.user import User
from family_api.db.session import get_session_factory
from family_api.ids import new_id
from family_api.security.passwords import hash_password
from family_api.services.households import create_household, seed_visibility

DEMO_PASSWORD = "correct-horse-battery"

MEMBERS = [
    ("papa@example.com", "Papá", "adult", "Padre"),
    ("mama@example.com", "Mamá", "adult", "Madre"),
    ("hermano@example.com", "Hermano", "teen", "Hermano"),
]

# Mixed on purpose: every level is represented so all three render paths
# are exercised the first time the app is opened.
DEMO_VISIBILITY = {
    "Papá": {"income": "summary", "expenses": "summary", "savings": "public", "debts": "private"},
    "Mamá": {"income": "public", "expenses": "public", "savings": "public", "debts": "summary"},
    "Hermano": {"income": "private", "expenses": "private", "savings": "private", "debts": "private"},
}


async def seed_demo_household(session: AsyncSession) -> None:
    existing = await session.scalar(
        select(Household).where(Household.name == "Familia Hernández")
    )
    if existing is not None:
        return

    daniel = User(
        id=new_id(), email="daniel@example.com",
        password_hash=hash_password(DEMO_PASSWORD), display_name="Daniel",
    )
    session.add(daniel)
    await session.flush()

    household, admin_member = await create_household(session, daniel, "Familia Hernández")
    admin_member.relationship = "Hijo"

    for email, name, role, relationship in MEMBERS:
        user = User(
            id=new_id(), email=email,
            password_hash=hash_password(DEMO_PASSWORD), display_name=name,
        )
        session.add(user)
        await session.flush()

        member = HouseholdMember(
            id=new_id(), household_id=household.id, user_id=user.id,
            role=role, relationship=relationship, status="active",
        )
        session.add(member)
        await session.flush()
        seed_visibility(session, member)
        await session.flush()

        for module, level in DEMO_VISIBILITY[name].items():
            await session.execute(
                update(VisibilitySetting)
                .where(
                    VisibilitySetting.member_id == member.id,
                    VisibilitySetting.module == module,
                )
                .values(level=level)
            )

    await session.flush()


async def main() -> None:
    factory = get_session_factory()
    async with factory() as session:
        await seed_demo_household(session)
        await session.commit()
    print("Seeded Familia Hernández. Password for every member:", DEMO_PASSWORD)


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && pytest tests/integration/test_seed.py -v`
Expected: PASS — 2 tests

- [ ] **Step 5: Run the full suite and the linters**

Run:
```bash
cd apps/api && pytest -v && ruff check . && mypy src
```
Expected: all tests PASS, no lint errors, no type errors. **Paste the real output — do not summarize from memory** (`docs/testing-strategy.md` §7).

- [ ] **Step 6: Verify migrations reverse from empty**

Run:
```bash
cd apps/api && DATABASE_URL=$TEST_DATABASE_URL alembic downgrade base \
  && DATABASE_URL=$TEST_DATABASE_URL alembic upgrade head
```
Expected: both succeed.

- [ ] **Step 7: Verify the seed against a real database**

Run: `make db && make migrate && make seed`
(`docker compose up -d db && cd apps/api && alembic upgrade head && python scripts/seed.py`)
Expected: prints the seeded confirmation. Then `make api-dev`
(`cd apps/api && uvicorn family_api.main:app --reload --port 8001`) and
confirm `GET http://localhost:8001/api/v1/health` returns `{"status": "ok"}`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/scripts apps/api/tests/integration/test_seed.py
git commit -m "feat(api): add demo household seed script"
```

---

## Plan Self-Review

**1. Spec coverage.** Every Module 1 requirement maps to a task:

| Requirement | Task |
| ----------- | ---- |
| FR-M1-01 household creation with COP/Bogotá defaults | 9 |
| FR-M1-02 one household per user | 8 (constraint), 9 + 11 (enforcement) |
| FR-M1-03 invite codes, 8 chars, no ambiguous glyphs | 10 |
| FR-M1-04 join, four distinct failure types | 11 |
| FR-M1-05 revoke, irreversible | 10 |
| FR-M1-06 profile, derived age | 5 (model), 9 (`derive_age`), 13 (editing) |
| FR-M1-07 self-edit profile, admin edits role/relationship | 12, 13 |
| FR-M1-08 deactivation preserves records | 12 |
| INV-R-01 last admin | 12 |
| INV-R-03 deactivation retains history | 12 |
| INV-D-03 household scoping | 9 (repository base) |
| INV-D-05 invite concurrency | 11 |
| FR-M2-01 seeded categories incl. `Aporte al hogar` | 9 |
| FR-M3-03 visibility defaults, debts private | 9 (creation), 11 (join) |
| Auth, rate limiting, refresh rotation (spec §4, §9) | 6, 7 |

**Deliberately deferred, with the plan that owns them:**
- The visibility *resolver* and enforcement (VR-01…VR-05, the matrix test) — Plan 2. This plan creates the table and seeds the defaults; nothing reads them yet.
- All Module 2 finance tables and endpoints — Plan 2.
- `PATCH /households/current` (rename, timezone) — Plan 2, alongside category CRUD, since both are small household-settings endpoints.

**2. Placeholder scan.** No "TBD", "TODO", "add error handling", or "similar to Task N". Every code step carries runnable code.

**3. Type consistency.** Verified across tasks: `new_id()` (Tasks 2→all), `hash_password`/`verify_password` (6→7, 14), `create_access_token`/`decode_access_token` (6→7), `generate_refresh_token` returning `(raw, hash)` (6→7), `TokenPair` (7→7), `CurrentUser` (7→9, 13), `CurrentMember` (9→10, 11, 12), `require_admin` (9→10, 12), `derive_age` (9→7, 12, 13), `seed_visibility` (9→11, 14), `assert_not_in_household` (9→11), `create_household` returning `(Household, HouseholdMember)` (9→14), `generate_code`/`INVITE_ALPHABET` (10→10).

**Two forward references are flagged inline** where task order forces them: `hash_password` in Task 5's conftest (Task 6 provides it) and `derive_age` in Task 7's router (Task 9 provides it). Both steps say what to do about it.
