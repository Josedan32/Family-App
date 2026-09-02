# Testing Strategy

Development is test-driven: a failing test first, then the code that passes it.
This document defines what must be covered and which tests are load-bearing.

Related: `docs/visibility-rules.md` §7, `docs/architecture.md` §9

---

## 1. Environment

- **`pytest` + `pytest-asyncio` + `httpx.AsyncClient`** against the real app.
- **Real PostgreSQL 16**, never SQLite. The schema depends on native enums,
  `CITEXT`, and `SELECT ... FOR UPDATE`; a SQLite suite would pass while
  production breaks.
- Each test runs in a transaction rolled back at teardown. Tests that
  deliberately exercise commit behaviour (the contribution mirror, invite
  concurrency) get a dedicated database and clean up explicitly.
- Factories build valid objects with sensible defaults; a test names only the
  fields it is actually about.

---

## 2. The test pyramid, and where it is deliberately top-heavy

| Layer | Coverage |
| ----- | -------- |
| Unit | Money arithmetic, the visibility resolver, period boundary math, invite code generation, derived balances. |
| Integration | Every endpoint through the real app and real database. |
| **Visibility** | **Its own suite, its own CI check.** See §3. |
| E2E | A single Playwright happy path: register → create household → invite → add income and expense → set visibility → verify what the other member sees. |

The visibility suite is intentionally larger than a normal pyramid would
suggest. It is the one area where a bug is not a defect but a breach, and
where the failure is silent — nobody files a bug report saying "I can see my
father's salary".

---

## 3. The visibility matrix — the most important test in the repo

Parametrized across the full cross product (`visibility-rules.md` §7):

- viewer role ∈ {admin, adult, teen, guest}
- viewer relationship ∈ {self, other member, other household}
- owner setting ∈ {private, summary, public}
- module ∈ {income, expenses, savings, debts}
- endpoint ∈ {list, detail, summary, dashboard card}

For every cell, assert the **exact status code and the exact set of field names
in the response**.

Asserting field *names*, not just values, is the point. A future feature that
adds `transaction_count` to a summary response would pass a value-only
assertion and leak. It fails this one.

### 3.1 Required specific cases

| # | Case | Expectation |
| - | ---- | ----------- |
| V-01 | Admin views another member's `private` debts | `403 not_visible`. Admin has no privilege. |
| V-02 | Guest views a `public` member's expenses | `403 not_visible`. Public means public *to the household*. |
| V-03 | Member views own `private` module | `200` full detail. Settings govern others, never yourself. |
| V-04 | `private` member vs. member with zero records | Responses distinguishable **only** as `403` vs `200 {total: 0}` — never `200 {total: null}`. |
| V-05 | Denial bodies compared byte-for-byte across "no such member", "private", "other household" | Identical. |
| V-06 | Loan where both parties set `debts: private` | Both parties see it in full (FR-M2-16). |
| V-07 | Third member views that loan | Resolves against the **borrower's** `debts` setting. |
| V-08 | Contribution by a member with `expenses: private` | Contribution visible to the household; the mirrored expense is not (`visibility-rules.md` §5.2). |
| V-09 | Setting changed, immediately re-read | New level applies at once. No cache window. |
| V-10 | Missing `visibility_settings` row | Resolves to the module default, never `public` (VR-05). |
| V-11 | Resolver raises | Resolves to `NONE`. Fail closed. |
| V-12 | Every module of a member is `private` | Dashboard card carries name, photo, relationship, and no figures (FR-D1-03). |

### 3.2 Route coverage test

Enumerates `app.routes`, filters to `GET` under the finance namespace, asserts
each declares a visibility dependency. An explicit allowlist covers legitimate
exemptions (household aggregates, `/me/*` routes), so every exemption is a
line someone deliberately wrote and a reviewer can see.

**Adding a read endpoint without a policy fails CI.**

---

## 4. Ledger integrity

| # | Case | Expectation |
| - | ---- | ----------- |
| L-01 | Create a contribution | Exactly one linked expense transaction exists, `source='contribution'`, `source_id` matching (INV-D-01). |
| L-02 | Contribution creation fails after the expense insert | Neither row exists. Forced by injecting an error mid-transaction. |
| L-03 | Delete a contribution | Both rows gone, in one transaction (FR-M4-06). |
| L-04 | Edit or delete a derived transaction via the transactions API | `409 derived_record` (FR-M2-05). |
| L-05 | Loan payment by the borrower | Lender's and borrower's views both reflect it — same row, so they cannot disagree (FR-M2-13). |
| L-06 | Payments totalling the loan amount | Status becomes `paid` from both perspectives. |
| L-07 | Overpayment on a debt or loan | Rejected; outstanding never goes negative. |
| L-08 | Negative or zero amount on any money endpoint | `422`. |
| L-09 | Savings balance | Equals `SUM(deposits) − SUM(withdrawals)`; no stored balance column exists (FR-M2-08). |
| L-10 | Grep the codebase for `float(`, `Decimal` on money paths, and JS arithmetic on amounts | No hits. Money is integers end to end. |
| L-11 | Period boundaries near midnight in `America/Bogota` | A transaction on the 1st at 00:30 local falls in the correct month, not the previous UTC one. |

---

## 5. Household and access

| # | Case | Expectation |
| - | ---- | ----------- |
| H-01 | Demote, deactivate, or remove the last admin | `409 last_admin` (INV-R-01). |
| H-02 | Two concurrent redemptions of a `max_uses=1` code | One succeeds, one gets `invite_exhausted`. `uses` never exceeds `max_uses` (INV-D-05). |
| H-03 | Expired, revoked, unknown codes | Distinct problem types (FR-M1-04). |
| H-04 | User already in a household creates or joins another | `409 already_in_household`. |
| H-05 | Any request for a resource in another household | `403`/`404` per the rules, and the repository-level scoping filter is proven present. |
| H-06 | Deactivated member's historical records | Still present and still attributed (INV-R-03). |
| H-07 | Refresh token replayed after rotation | `401 token_reused`, whole family revoked. |
| H-08 | Login with a wrong password vs. an unknown email | Indistinguishable response and comparable timing. |
| H-09 | Rate limits on `/auth/login` and `/households/join` | `429` with `Retry-After`. |
| H-10 | Member writes a transaction naming another member as owner | Rejected; owner is always the caller (FR-M2-03). |

---

## 6. Frontend

- **Component tests** (Vitest + Testing Library) for `MoneyInput` (grouping and
  caret behaviour while typing), `PrivateBlock` (renders "Privado", never a
  blurred or placeholder figure), `VisibilityBadge`, `LoanCard` (correct
  perspective from one row).
- **Formatting tests**: `$2.000.000` in `es-CO`, no decimals for COP, true
  minus sign for expenses.
- **Contract test**: regenerating the OpenAPI client produces no diff.
- **Accessibility**: `axe` on every route, zero violations.
- **Responsive**: Playwright at 375 × 812 (iPhone), 768, and 1280 — asserting
  no horizontal overflow, the bottom nav clears the safe area, and no full
  height element is clipped by the Safari toolbar.

---

## 7. Definition of done for a task

A task is complete only when all of these hold. "It works when I click it" is
not on the list.

- [ ] Tests were written before the implementation.
- [ ] The full suite passes — output pasted, not summarized from memory.
- [ ] New endpoints appear in the visibility matrix or the exemption allowlist.
- [ ] Migrations apply and roll back cleanly on an empty database.
- [ ] `ruff`, `mypy --strict`, `eslint`, `tsc` all clean.
- [ ] Requirement IDs from the spec are referenced in the test names.
- [ ] No money is a float anywhere in the change.
- [ ] No financial field appears in a log line.
