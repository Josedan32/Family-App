# API Contract — Phase 1

Base path `/api/v1`. JSON in, JSON out. Errors as RFC 9457
`application/problem+json`. The OpenAPI document FastAPI generates from these
routes is the single source of truth for the web client — **the TypeScript
client is generated, never hand-written.**

Related: `docs/visibility-rules.md`, `docs/data-model.md`

---

## 1. Conventions

| Topic | Rule |
| ----- | ---- |
| Auth | `Authorization: Bearer <access_token>` on everything except `/auth/register`, `/auth/login`, `/auth/refresh`. |
| Money in JSON | `{"amount_minor": 2000000, "currency": "COP"}`. Integers only. **Never a decimal, never a formatted string.** Formatting is the client's job. |
| Dates | Financial dates `"2026-09-02"`. Timestamps RFC 3339 UTC `"2026-09-02T14:03:00Z"`. |
| Periods | `?period=2026-09` (a month) or `?from=&to=` (explicit dates). Boundaries computed in the household timezone. |
| Pagination | `?limit=` (default 50, max 200) `&cursor=`. Responses carry `next_cursor`, `null` when exhausted. **Never present on a summary response** (`visibility-rules.md` §3.1). |
| Idempotency | `Idempotency-Key` header honoured on all money-writing `POST`s. |
| Validation | `422` with `errors[]`, each naming `field` and `code`. |

### 1.1 Error shape

```json
{
  "type": "not_visible",
  "title": "No tienes acceso a esta información",
  "status": 403,
  "detail": null,
  "instance": "/api/v1/members/0193.../expenses"
}
```

`type` is a stable machine-readable slug. Clients branch on `type`, never on
`title` — titles are Spanish user-facing copy and will change.

### 1.2 Error catalogue

| `type` | Status | Meaning |
| ------ | :----: | ------- |
| `invalid_credentials` | 401 | Login failed. Identical for bad email and bad password. |
| `token_expired` | 401 | Access token expired; refresh. |
| `token_reused` | 401 | A rotated refresh token was replayed. All sessions revoked. |
| `not_visible` | 403 | Visibility denial. **Uniform across every denial reason.** |
| `forbidden_role` | 403 | The action requires a role the member lacks. |
| `not_found` | 404 | Resource absent, and its absence is not itself sensitive. |
| `already_in_household` | 409 | FR-M1-02. |
| `last_admin` | 409 | INV-R-01. |
| `derived_record` | 409 | FR-M2-05 — edit or delete a contribution-generated transaction. |
| `period_closed` | 409 | FR-M4-08. |
| `period_exists` | 409 | A period already exists for that month. |
| `invite_not_found` / `invite_expired` / `invite_exhausted` / `invite_revoked` | 400 | FR-M1-04. |
| `insufficient_pot` | 409 | FR-M4-14 — a pot-funded expense would overdraw the pot. |
| `no_open_period` | 409 | An in-kind contribution was requested with no open contribution period. |
| `immutable_field` | 409 | Amount or funding on an existing household expense. |
| `cycle_exists` | 409 | A chore cycle already starts on that date. |
| `duplicate_category` | 409 | Same name and kind already exists in the household. |
| `validation_error` | 422 | Field-level validation. |
| `rate_limited` | 429 | Carries `Retry-After`. |

---

## 2. Auth

| Method | Path | Notes |
| ------ | ---- | ----- |
| `POST` | `/auth/register` | `{email, password, display_name}` → `201` + token pair. Rate limited. |
| `POST` | `/auth/login` | `{email, password}` → `200` + token pair. Rate limited, uniform failure. |
| `POST` | `/auth/refresh` | `{refresh_token}` → new pair. **Rotates**: the old token is revoked; replaying it returns `token_reused` and revokes the family. |
| `POST` | `/auth/logout` | Revokes the presented refresh token. |
| `GET` | `/auth/me` | The user, their membership, role, household, and their own visibility settings. |

Access token TTL 15 min, refresh 30 days.

---

## 3. Household

| Method | Path | Role | Notes |
| ------ | ---- | ---- | ----- |
| `POST` | `/households` | any | `{name, currency?, timezone?}`. Creator becomes admin. Seeds categories and visibility settings. `409 already_in_household` if the user has one. |
| `GET` | `/households/current` | member | The caller's household with member list. |
| `PATCH` | `/households/current` | admin | `{name?, timezone?}`. **Currency is immutable** — changing it would reinterpret every stored amount. |
| `GET` | `/households/current/members` | member | Members with derived `age`, role, relationship, status. No finance data. |
| `PATCH` | `/households/current/members/{member_id}` | admin | `{role?, relationship?}`. `409 last_admin`. |
| `DELETE` | `/households/current/members/{member_id}` | admin | Deactivates (FR-M1-08). `409 last_admin`. |
| `PATCH` | `/me/profile` | self | `{display_name?, photo_url?, birth_date?}`. |

### 3.1 Invites

| Method | Path | Role | Notes |
| ------ | ---- | ---- | ----- |
| `POST` | `/households/current/invites` | admin | `{role_granted, expires_in_days?, max_uses?}` → `{code, expires_at, ...}`. |
| `GET` | `/households/current/invites` | admin | Active and revoked codes. |
| `DELETE` | `/households/current/invites/{id}` | admin | Revokes. Irreversible. |
| `POST` | `/households/join` | any | `{code}` → membership. Rate limited hard: this endpoint is the household's front door. |

---

## 4. Categories

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/categories?kind=income\|expense&include_archived=false` | Household categories. |
| `POST` | `/categories` | `{kind, name, icon?}`. |
| `PATCH` | `/categories/{id}` | `{name?, icon?}`. |
| `DELETE` | `/categories/{id}` | Archives. System categories archive but never delete (FR-M2-02). |

---

## 5. Personal finance — own data

These operate on the caller's own ledger. No visibility resolution applies;
a member always sees their own data in full.

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/me/transactions?kind=&category_id=&from=&to=&limit=&cursor=` | |
| `POST` | `/me/transactions` | `{kind, category_id, amount_minor, occurred_on, note?}`. Owner is always the caller (FR-M2-03). |
| `PATCH` | `/me/transactions/{id}` | `409 derived_record` if `source <> 'manual'`. |
| `DELETE` | `/me/transactions/{id}` | Same. |
| `GET` | `/me/savings-goals` | Each with derived `balance_minor` and `progress`. |
| `POST` | `/me/savings-goals` | `{name, target_amount_minor, target_date?}`. |
| `PATCH` / `DELETE` | `/me/savings-goals/{id}` | Delete only when it has no entries; otherwise archive. |
| `POST` | `/me/savings-goals/{id}/entries` | `{kind, amount_minor, occurred_on, note?}`. |
| `DELETE` | `/me/savings-goals/{id}/entries/{entry_id}` | |
| `GET` | `/me/debts` | Each with derived `outstanding_minor`. |
| `POST` | `/me/debts` | `{creditor_type, creditor_label, principal_minor, annual_interest_rate?, due_day?}`. |
| `PATCH` / `DELETE` | `/me/debts/{id}` | |
| `POST` | `/me/debts/{id}/payments` | `{amount_minor, paid_on, note?}`. Flips status to `paid` at zero. |
| `DELETE` | `/me/debts/{id}/payments/{payment_id}` | Reopens the debt if it was `paid`. |

---

## 6. Personal finance — another member's data

**Every route here resolves visibility** (`docs/visibility-rules.md` §4.1). The
response type depends on the resolved level, and the OpenAPI schema declares
the union.

| Method | Path | `FULL` | `SUMMARY` | `NONE` |
| ------ | ---- | ------ | --------- | ------ |
| `GET` | `/members/{id}/income?period=` | Transaction list | `{period, total_minor, currency}` | `403 not_visible` |
| `GET` | `/members/{id}/expenses?period=` | Transaction list | `{period, total_minor, currency}` | `403 not_visible` |
| `GET` | `/members/{id}/savings` | Goals with balances | `{total_balance_minor, currency}` | `403 not_visible` |
| `GET` | `/members/{id}/debts` | Debts with outstanding | `{total_outstanding_minor, currency}` | `403 not_visible` |

The summary payload has a **fixed shape** — same fields whether the member has
one record or a thousand — and carries no count, no dates beyond the period
bounds, and no `next_cursor`.

A member with no data returns `total_minor: 0`. A private member returns `403`.
These are never confusable (`visibility-rules.md` §3.2).

---

## 7. Loans between members

Visible in full to both parties regardless of settings (FR-M2-16). To a third
member, resolved against the **borrower's** `debts` setting.

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/loans?role=lender\|borrower\|all&status=` | Loans the caller may see. Each carries `outstanding_minor` and the caller's `perspective` (`"lender"` or `"borrower"`). |
| `POST` | `/loans` | `{lender_member_id, borrower_member_id, amount_minor, lent_on, due_on?, note?}`. The caller must be one of the two parties. Neither may be a guest. |
| `GET` | `/loans/{id}` | |
| `POST` | `/loans/{id}/payments` | `{amount_minor, paid_on}`. **Either party may record** (FR-M2-14). Advances status. |
| `DELETE` | `/loans/{id}` | Cancels. **Lender only** (FR-M2-14). |

---

## 8. Household contribution

| Method | Path | Role | Notes |
| ------ | ---- | ---- | ----- |
| `GET` | `/contribution-periods?status=` | member | |
| `POST` | `/contribution-periods` | admin | `{period_month, goal_amount_minor}`. `409 period_exists`. |
| `GET` | `/contribution-periods/current` | member | Target, collected, percentage, and per-member contributed vs pledged (FR-M4-04). **Always visible to all members** (FR-M4-07). |
| `PATCH` | `/contribution-periods/{id}` | admin | `{goal_amount_minor?}`. `409 period_closed`. |
| `POST` | `/contribution-periods/{id}/close` | admin | |
| `PUT` | `/contribution-periods/{id}/pledges` | admin | `{pledges: [{member_id, expected_amount_minor}]}`. Replaces the set. |
| `POST` | `/contribution-periods/{id}/contributions` | member | `{amount_minor, paid_on, note?}`. **Creates the mirrored expense atomically** (FR-M4-05). `409 period_closed`. |
| `DELETE` | `/contributions/{id}` | owner or admin | Deletes contribution and its mirrored expense atomically (FR-M4-06). |

Response for `/contribution-periods/current`:

```json
{
  "period_month": "2026-09-01",
  "status": "open",
  "goal_amount_minor": 2000000,
  "collected_minor": 1900000,
  "progress": 0.95,
  "currency": "COP",
  "members": [
    { "member_id": "...", "display_name": "Papá",
      "pledged_minor": 1000000, "contributed_minor": 1000000 },
    { "member_id": "...", "display_name": "Mamá",
      "pledged_minor": 600000, "contributed_minor": 600000 },
    { "member_id": "...", "display_name": "Daniel",
      "pledged_minor": 400000, "contributed_minor": 300000 }
  ]
}
```

---

## 9. Visibility settings

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/me/visibility` | The caller's four settings. |
| `PUT` | `/me/visibility` | `{income, expenses, savings, debts}`. **Self only** (FR-M3-06) — there is deliberately no route to set another member's visibility, for any role. |

The `GET` response also carries `disclosures`, the Spanish copy the settings
screen must render (household totals include everyone; contributions are always
visible), so the disclosure text lives with the rules rather than drifting in
the frontend.

---

## 10. Dashboard

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/dashboard?period=` | Phase 1 dashboard (FR-D1-01). |

```json
{
  "period": "2026-09",
  "currency": "COP",
  "household": {
    "income_minor": 5500000,
    "expenses_minor": 3900000,
    "savings_minor": 1600000
  },
  "contribution": { "goal_amount_minor": 2000000, "collected_minor": 1900000, "progress": 0.95 },
  "members": [
    {
      "member_id": "...", "display_name": "Papá", "relationship": "Padre",
      "photo_url": null,
      "income": { "level": "summary", "total_minor": 3000000 },
      "expenses": { "level": "summary", "total_minor": 2100000 },
      "savings": { "level": "public", "total_minor": 900000 },
      "debts": { "level": "private" }
    }
  ]
}
```

Note the shape: a `private` module carries **`level` and no figure at all** —
not `null`, not `0`. A member with everything private renders as name, photo
and relationship only (FR-D1-03).

`household` totals include every member, private ones included (FR-D1-02, §8.4
of the spec). The client must render the disclosure from `/me/visibility`
alongside them.

---

## 11. Household ledger

Always visible to every household member (FR-M4-15). No visibility resolution.

| Method | Path | Role | Notes |
| ------ | ---- | ---- | ----- |
| `GET` | `/household-expenses?period=&funding=&category_id=` | member | The household's own ledger. |
| `POST` | `/household-expenses` | member | See below. |
| `PATCH` | `/household-expenses/{id}` | payer or admin | Category, date and note only. **Amount and funding are immutable** — changing either would silently rewrite the pot balance and, for member-funded rows, someone's personal ledger. Delete and re-create instead. |
| `DELETE` | `/household-expenses/{id}` | payer or admin | Removes the expense, its mirrored transaction and any in-kind contribution, atomically. |
| `GET` | `/household-expenses/pot` | member | `{balance_minor, collected_minor, spent_minor, currency}`. All derived (FR-M4-13). |

Create request:

```json
{
  "category_id": "...",
  "amount_minor": 1200000,
  "occurred_on": "2026-09-03",
  "note": "Arriendo septiembre",
  "funding": "pot",
  "paid_by_member_id": null,
  "counts_as_contribution": false
}
```

- `funding: "pot"` → `paid_by_member_id` must be absent. Rejected with
  `409 insufficient_pot` if it would overdraw the pot (FR-M4-14).
- `funding: "member"` → `paid_by_member_id` required, and **must be the
  caller** unless the caller is an admin. Writes the mirrored personal expense
  atomically (FR-M4-11).
- `counts_as_contribution: true` → valid only with `funding: "member"` and an
  open contribution period. Creates an in-kind `Contribution` pointing at the
  **same** transaction (FR-M4-12). Rejected with `409 no_open_period` otherwise.

Response includes `expense_transaction_id` and `contribution_id` (null when not
in kind) so a client can navigate between the three surfaces.

---

## 12. Debt installments

No new endpoints. The three optional fields join the existing debt payloads.

`POST /me/debts` and `PATCH /me/debts/{id}` accept:

```json
{
  "installments_total": 12,
  "installment_amount_minor": 100000,
  "first_installment_on": "2026-10-15"
}
```

All three together or all three absent — `422 validation_error` otherwise
(FR-M2-17). `DebtResponse` gains four **derived** fields (FR-M2-18):

```json
{
  "installments_total": 12,
  "installments_paid": 2,
  "installments_remaining": 10,
  "next_installment_on": "2026-12-15",
  "next_installment_amount_minor": 100000,
  "is_overdue": false
}
```

They are `null` on a debt with no plan.

---

## 13. Chores (Phase 3)

Visible to the whole household (FR-M8-15). No visibility resolution.

| Method | Path | Role | Notes |
| ------ | ---- | ---- | ----- |
| `GET` | `/chores?include_archived=false` | member | |
| `POST` | `/chores` | **admin** | `{name, description?, frequency, effort_points}`. Effort weight is the currency of fairness, so only admins price it (FR-M8-03). |
| `PATCH` | `/chores/{id}` | **admin** | Changing `effort_points` never rewrites existing assignments (FR-M8-04). |
| `DELETE` | `/chores/{id}` | **admin** | Archives. |
| `POST` | `/chore-cycles` | **admin** | `{starts_on, ends_on}` → generates assignments. `409 cycle_exists` if one already starts that day. |
| `GET` | `/chore-cycles/current` | member | The cycle covering today, with all its assignments. |
| `GET` | `/chore-assignments?member_id=&status=&from=&to=` | member | |
| `POST` | `/chore-assignments/{id}/complete` | assignee or admin | Credits `completed_by_member_id` (FR-M8-10). |
| `POST` | `/chore-assignments/{id}/reassign` | assignee or admin | `{member_id}`. Credit follows whoever does it (FR-M8-11). |
| `GET` | `/effort-balances` | member | Every member's balance over the household window. |
| `GET` \| `POST` \| `DELETE` | `/me/absences`, `/me/absences/{id}` | member | `{starts_on, ends_on, reason?}` (FR-M8-12). |
| `POST` | `/effort-adjustments` | **admin** | `{member_id, points, reason}`. `reason` is required — an unexplained adjustment to a fairness ledger is indistinguishable from favouritism (FR-M8-14). |

`GET /effort-balances`:

```json
{
  "window_days": 60,
  "window_start": "2026-07-05",
  "members": [
    { "member_id": "...", "display_name": "Daniel",
      "effort_points": 34, "completed_count": 11, "pending_count": 2 },
    { "member_id": "...", "display_name": "Papá",
      "effort_points": 31, "completed_count": 7, "pending_count": 1 }
  ]
}
```

`completed_count` is safe to expose here — chores carry no visibility rules, so
the reasoning in §3.1 that forbids counts in a financial summary does not apply.
