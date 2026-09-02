# Family Hub — Repository Conventions

A shared household operating system: personal finances, household
contributions, groceries, chores and goals, behind a per-member privacy model.

**Read before writing any code:**

| Document | When |
| -------- | ---- |
| `docs/superpowers/specs/2026-09-02-family-hub-design.md` | Always. The master spec. |
| `docs/visibility-rules.md` | **Before any read endpoint.** Most security-sensitive document here. |
| `docs/data-model.md` | Before any schema or query work. |
| `docs/api-contract.md` | Before any endpoint. |
| `docs/design-system.md` | Before any UI. |
| `docs/glossary.md` | Before naming anything. |
| `docs/testing-strategy.md` | Before any test. |

---

## The five rules that override convenience

1. **Money is never a float.** `BIGINT` minor units plus a currency code. No
   `float`, no `Decimal` on transport, no JavaScript arithmetic on amounts.
   Totals are computed server-side in integers.

2. **Every read endpoint touching member data declares a visibility
   dependency.** Not a helper you remember to call — a dependency in the route
   signature. CI fails otherwise.

3. **Detail and summary are separate Pydantic models.** Never one model with
   fields excluded at serialization time. One forgotten `exclude` is a data
   breach; separate types make it a type error.

4. **No role sees past another member's visibility setting.** Admin included.
   If you are writing `if role == "admin"` near a finance read, you are writing
   a bug.

5. **Tests first.** A failing test, then the code that passes it.

---

## Language

- **UI: Spanish (`es-CO`).** Every user-facing string.
- **Everything else: English.** Code, identifiers, comments, docstrings,
  commits, tests, error slugs, documentation.
- Translate through `docs/glossary.md`. Do not invent a synonym.

---

## Layering

`routers → services → repositories → models`, strictly one-directional.

- Routers parse, declare dependencies, call **one** service, serialize. No SQL.
- Services hold business rules and own transaction boundaries. They raise
  domain errors and know nothing about HTTP.
- Repositories build queries and apply household scoping **in one place**.
- Models map tables.

---

## Commits

Per the global convention: `<type>(<scope>): <subject>`, imperative, ≤ 50
chars, no trailing period. Types: `feat`, `fix`, `docs`, `style`, `refactor`,
`test`, `chore`, `perf`. Atomic — one logical change per commit.

```
feat(visibility): add per-module resolver
test(loans): cover both-parties-private case
fix(contributions): roll back expense on failure
```

---

## Tooling

`rg` over `grep`, `fd` over `find`, `tree` for structure.

```
make api-dev     make web-dev     make test
make migrate     make seed        make api-types
```

`make seed` builds the Familia Hernández household from the spec, with mixed
visibility settings, so privacy behaviour is visible immediately.

---

## Definition of done

Full checklist in `docs/testing-strategy.md` §7. The short form: tests written
first and passing (output pasted, not recalled), migrations up **and** down
clean, `ruff` / `mypy --strict` / `eslint` / `tsc` clean, new endpoints in the
visibility matrix, no float on money, no financial field in a log line.

---

## Things that look like improvements and are not

- **Excluding private members from household totals.** Makes the dashboard
  wrong, and creates a new leak: a total that shifts when someone changes a
  setting reveals that they changed it. See spec §8.4.
- **Making the contribution-generated expense always visible** because the
  contribution is. Same fact, two surfaces, two rules. See
  `visibility-rules.md` §5.2.
- **Caching API responses in the service worker.** A cached financial response
  outlives the visibility setting that permitted it.
- **A stored `balance` column on savings goals or debts.** A second source of
  truth waiting to disagree with the first.
- **Blurring a private figure instead of hiding it.** A blurred number invites
  guessing at a magnitude. Render `PrivateBlock`.
