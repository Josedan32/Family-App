# Architecture

Related: `docs/superpowers/specs/2026-09-02-family-hub-design.md` §4, §8

---

## 1. Topology

```
┌─────────────────┐      HTTPS/JSON      ┌──────────────────┐
│  apps/web       │ ───────────────────▶ │  apps/api        │
│  Next.js (PWA)  │  generated TS client │  FastAPI         │
│  iOS Safari 16+ │ ◀─────────────────── │  Python 3.12     │
└─────────────────┘                      └────────┬─────────┘
                                                  │ asyncpg
                                         ┌────────▼─────────┐
                                         │  PostgreSQL 16   │
                                         └──────────────────┘
```

Redis and Celery are **not** part of Phase 1. They arrive in Phase 3 with
scheduled notifications (M9), which is the first thing that genuinely needs a
job queue.

---

## 2. Repository layout

```
Family/
├── apps/
│   ├── api/
│   │   ├── src/family_api/
│   │   │   ├── main.py                 # app factory, middleware, error handlers
│   │   │   ├── config.py               # pydantic-settings, env-driven
│   │   │   ├── db/
│   │   │   │   ├── session.py          # async engine + session dependency
│   │   │   │   └── models/             # SQLAlchemy 2.0 declarative, one file per aggregate
│   │   │   ├── schemas/                # Pydantic v2. detail_*.py and summary_*.py stay separate
│   │   │   ├── routers/                # thin: parse, delegate, serialize
│   │   │   ├── services/               # all business rules and transactions live here
│   │   │   │   ├── visibility.py       # THE resolver
│   │   │   │   ├── contributions.py    # the atomic mirror write
│   │   │   │   └── ...
│   │   │   ├── repositories/           # query construction, household scoping
│   │   │   ├── security/               # hashing, tokens, rate limiting
│   │   │   └── money.py                # minor-unit arithmetic. No float, ever.
│   │   ├── migrations/                 # Alembic
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   └── visibility/             # the matrix + route-coverage tests
│   │   └── pyproject.toml
│   └── web/
│       ├── src/
│       │   ├── app/                    # Next.js App Router
│       │   │   ├── (auth)/             # login, register, join
│       │   │   └── (app)/              # dashboard, finanzas, hogar, aportes, ajustes
│       │   ├── components/
│       │   │   ├── ui/                 # primitives from the design system
│       │   │   └── finance/
│       │   ├── lib/
│       │   │   ├── api/generated/      # OPENAPI-GENERATED. Never edit by hand.
│       │   │   ├── money.ts            # formatting only; arithmetic stays server-side
│       │   │   └── query.ts            # TanStack Query setup
│       │   └── styles/
│       ├── public/                     # PWA manifest, icons, service worker
│       └── package.json
├── docs/
├── docker-compose.yml
├── Makefile
└── CLAUDE.md
```

---

## 3. Backend layering

Four layers, strictly one-directional. **A router never touches the database; a
service never builds a response model.**

| Layer | Responsibility | Forbidden |
| ----- | -------------- | --------- |
| `routers/` | Parse the request, declare dependencies (auth, visibility), call one service, serialize. | SQL, business rules, multi-step orchestration. |
| `services/` | Business rules, invariants, transaction boundaries. | Knowing about HTTP, `Request`, or status codes. Raises domain errors that middleware maps. |
| `repositories/` | Query construction. **Every query is household-scoped here** — the scoping filter is applied in one place so it cannot be forgotten in another. | Business rules. |
| `db/models/` | Table mappings and constraints. | Anything else. |

**Transaction boundaries live in services.** A service method is one unit of
work — `create_contribution` opens the transaction, writes the transaction row
and the contribution row, and commits or rolls back both (INV-D-01).

### 3.1 Where each invariant lives

| Invariant | Enforced |
| --------- | -------- |
| INV-R-01 last admin | `services/members.py`, `SELECT ... FOR UPDATE` on the household |
| INV-D-01 contribution mirror | `services/contributions.py`, single transaction |
| INV-D-02 loan parties | `services/loans.py` |
| INV-D-03 household scoping | `repositories/` base class, applied to every query |
| INV-D-05 invite concurrency | `services/invites.py` + DB `CHECK` as backstop |
| VR-01…VR-05 visibility | `services/visibility.py`, reachable only through the route dependency |

---

## 4. Contract between API and web

FastAPI emits OpenAPI 3.1. A build step generates the TypeScript client into
`apps/web/src/lib/api/generated/`. That directory is committed but **never
hand-edited**, and CI fails if regenerating it produces a diff — which makes a
backend change that breaks the frontend a build failure rather than a runtime
surprise.

```
make api-types    # regenerate the client from a running API
```

---

## 5. Frontend architecture

- **Next.js App Router**, React Server Components for reads where practical.
  Anything behind visibility rules is fetched **server-side with the caller's
  token**, so no unreadable data reaches the browser at all — defence in depth
  behind the API's own enforcement.
- **TanStack Query** for client-side mutation state, optimistic updates, and
  rollback.
- **Tailwind** with the tokens in `docs/design-system.md`.
- **PWA**: manifest, icons, service worker caching the app shell. Phase 1 is
  read-only offline; no write queue, no sync conflicts.
- **No global client state library.** Server state belongs to Query; the little
  UI state that remains belongs to components.

---

## 6. Configuration

All configuration is environment-driven via `pydantic-settings`. No secret is
ever committed.

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | `postgresql+asyncpg://...` |
| `JWT_SECRET` | Signing key. Rotating it invalidates all sessions. |
| `ACCESS_TOKEN_TTL_MINUTES` | Default `15` |
| `REFRESH_TOKEN_TTL_DAYS` | Default `30` |
| `CORS_ORIGINS` | Comma-separated web origins |
| `RATE_LIMIT_AUTH_PER_MINUTE` | Default `10` |
| `RATE_LIMIT_INVITE_PER_HOUR` | Default `20` |
| `DEFAULT_CURRENCY` | Default `COP` |
| `DEFAULT_TIMEZONE` | Default `America/Bogota` |
| `NEXT_PUBLIC_API_BASE_URL` | Web → API base |

`.env.example` lists every variable with a safe placeholder. CI asserts that
every key read by `config.py` appears in `.env.example`.

---

## 7. Local development

```
docker compose up -d db      # Postgres 16
make api-dev                 # uvicorn --reload
make web-dev                 # next dev
make migrate                 # alembic upgrade head
make seed                    # the example household from the spec
make test                    # full suite
```

`make seed` creates the Familia Hernández household from §1.1 of the spec —
Daniel (admin), Papá, Mamá, Hermano — with a spread of visibility settings, so
the privacy behaviour is visible the moment you open the app rather than
something you have to construct by hand.

---

## 8. Deployment

Phase 1 targets a single small VPS or a managed container host.

- API: container, `uvicorn` behind the platform's TLS termination.
- Web: Vercel or the same host; static assets on a CDN.
- Database: managed Postgres 16 with automated backups, **or** self-hosted with
  the nightly `pg_dump` from the spec's NFR table. This database holds a
  family's entire financial history — a losable database is not acceptable
  here in the way it might be for a side project's cache.
- Migrations run as a release step before the new API version takes traffic.

---

## 9. CI

Every pull request:

1. Lint and format — `ruff`, `mypy --strict` on the API; `eslint`, `tsc` on web.
2. `alembic upgrade head` then `downgrade base` against an empty database.
3. Full pytest suite against a real Postgres service container. **No SQLite**
   — the enums, `CITEXT`, and `FOR UPDATE` semantics must be the real ones.
4. **The visibility matrix and route-coverage tests**, reported as their own
   check so a failure there is unmistakable.
5. Regenerate the TS client; fail on diff.
6. `next build`.

---

## 10. Observability

Structured JSON logs with a request id. **Log lines never contain amounts,
notes, category names, or any financial field** — a log aggregator is exactly
the kind of side channel the visibility model is meant to prevent, and a leak
there is invisible until it is not. Log member ids and route names; that is
enough to debug with.
