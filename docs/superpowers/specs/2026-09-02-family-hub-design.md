# Family Hub — Product & Technical Design

- **Date:** 2026-09-02
- **Status:** Approved for implementation planning
- **Owner:** Daniel Hernández
- **Phase covered in implementable depth:** Phase 1 (Modules 1–4)
- **Companion documents:** `docs/architecture.md`, `docs/data-model.md`,
  `docs/api-contract.md`, `docs/visibility-rules.md`, `docs/design-system.md`,
  `docs/testing-strategy.md`, `docs/glossary.md`

---

## 1. Problem and purpose

Households run on money, groceries, and chores, but the information about all
three lives in people's heads. Nobody can answer "how much did we actually save
last month", "who has carried the most household work", or "when does the rice
run out" without a conversation that nobody wants to have.

Existing tools solve one slice each. Budget apps ignore that a household is
several people with separate finances and unequal willingness to disclose them.
Chore apps ignore money. Grocery apps ignore both.

**Family Hub is a shared household operating system for a small family.** Its
differentiator is not expense tracking. It is the combination of personal
finance, household contribution, groceries, inventory, chores, and goals, all
sitting behind a **privacy model that lets each member decide what the rest of
the household sees**.

That privacy model is the product. Without it, members enter fake numbers or
stop entering numbers, and every other module degrades into decoration.

### 1.1 Primary users

A single household of 3–6 people, one of whom is technical. Example household:

| Member  | Role          | Relationship |
| ------- | ------------- | ------------ |
| Daniel  | Administrator | Hijo         |
| Papá    | Adult         | Padre        |
| Mamá    | Adult         | Madre        |
| Hermano | Teen          | Hermano      |

### 1.2 Success criteria for Phase 1

1. Four real household members are entering real financial data weekly, one
   month after launch.
2. A member can state, without reading documentation, what the other members
   can and cannot see about them.
3. The household contribution dashboard is accurate enough to settle a dispute
   about who paid what.
4. No member's private data has ever been visible to another member. This is a
   correctness requirement, not an aspiration; see §8.

---

## 2. Scope and phasing

The full product is ten modules. This document specifies all ten so the data
model stays coherent, but only Phase 1 is specified at implementable depth.

| Phase | Modules | Theme |
| ----- | ------- | ----- |
| **1** | M1 Household, M2 Personal Finance, M3 Transparency, M4 Household Contribution | The financial spine |
| 2 | M5 Smart Market, M6 Home Inventory, M7 Purchase Planning | The consumption engine |
| 3 | M8 Household Chores, M9 Notifications | Operations and reminders |
| 4 | M10 Executive Dashboard (full), AI agent | Insight |

Phase 1 ships with a **reduced dashboard** (financial totals and contribution
progress only). The full Module 10 dashboard arrives in Phase 4 once there is
grocery and chore data worth charting.

Infrastructure follows need: **Redis and Celery are not introduced until Phase
3**, when scheduled notifications create the first real need for a job queue.

---

## 3. Design principles

These are decision-making tools. When a later choice is ambiguous, resolve it
against this list in order.

1. **Privacy is not a feature, it is a constraint.** A member's visibility
   setting is honored by every code path without exception.
2. **No role overrides privacy.** Administrator is a logistics role — invites,
   roles, household goals. It confers no visibility into another member's
   finances. If Papá sets Debts to Private, Daniel-as-administrator sees
   nothing.
3. **One fact, one row.** Money that moves between two parties is a single
   record read from both sides, never two records kept in sync.
4. **Never surprise a member about what is visible.** Disclosed derivability is
   acceptable; undisclosed derivability is not. See §8.4.
5. **Store facts, derive interpretations.** Store `birth_date`, derive age.
   Store purchases and dates, derive consumption rate.
6. **YAGNI.** Every module earns its phase. Infrastructure arrives the phase it
   is needed, not before.

---

## 4. Assumptions and constraints

| Area | Decision |
| ---- | -------- |
| UI language | Spanish (`es-CO`). |
| Code language | English — code, comments, identifiers, commits, docs, tests, errors. |
| Currency | `BIGINT` minor units + ISO-4217 code. **Never floating point.** COP has 0 decimal places; the minor-unit count is a per-currency property, not a hardcoded 2. |
| Money display | `es-CO` grouping: `$2.000.000`. |
| Timestamps | `timestamptz`, stored UTC, rendered `America/Bogota`. |
| Financial dates | Plain `DATE`. A purchase happened on a day, not at an instant. |
| Devices | iOS Safari 16+ is the primary target. Android Chrome and desktop supported. |
| Delivery | Responsive web, installable PWA. No native app in any phase in this document. |
| Auth | Email + password (argon2id), JWT access + refresh. Join a household by invite code. |
| Household count | A user belongs to **at most one household** in Phase 1. The schema does not prevent multi-household later, but no UI or endpoint supports it. |
| Offline | Read-only cache only in Phase 1. No offline writes, no sync conflict resolution. |

---

## 5. Roles and permissions

Four roles. Every permission below is household-scoped.

| Capability | Admin | Adult | Teen | Guest |
| ---------- | :---: | :---: | :--: | :---: |
| Create / rename household, set currency & timezone | ✅ | — | — | — |
| Issue, list, revoke invite codes | ✅ | — | — | — |
| Assign or change member roles | ✅ | — | — | — |
| Deactivate a member | ✅ | — | — | — |
| Set the monthly contribution goal and pledges | ✅ | — | — | — |
| Own a personal ledger (income, expenses, savings, debts) | ✅ | ✅ | ✅ | — |
| Be a party to a member loan | ✅ | ✅ | ✅ | — |
| Record a household contribution | ✅ | ✅ | ✅ | — |
| Set own visibility settings | ✅ | ✅ | ✅ | — |
| View household aggregate dashboard | ✅ | ✅ | ✅ | ✅ |

**Viewing another member's data is governed solely by that member's visibility
setting, identically for all four roles.**

**Guest** is a read-only observer of household aggregates. A guest has no
personal ledger, cannot be a loan counterparty, and never sees per-member
detail regardless of that member's setting — Public means "public to the
household", and a guest is a visitor, not a household member.

### 5.1 Role invariants

- **INV-R-01:** A household always has at least one active administrator. The
  last admin cannot be demoted, deactivated, or removed. The API rejects such
  attempts with `409 last_admin`.
- **INV-R-02:** Role changes never retroactively alter what historical records
  are attributed to. Demoting Papá to Teen does not move his transactions.
- **INV-R-03:** Deactivating a member preserves all their records and keeps
  them attributed. Deactivation removes access, it does not erase history.

---

## 6. Phase 1 modules

Requirement IDs are stable and referenced by the implementation plan.

### 6.1 Module 1 — Household management

**FR-M1-01** A registered user can create a household with a name, currency
(default `COP`) and timezone (default `America/Bogota`). The creator becomes
its administrator with an active membership.

**FR-M1-02** A user may belong to at most one household. Creating or joining a
second is rejected with `409 already_in_household`.

**FR-M1-03** An administrator can generate an invite code. A code carries: the
role it grants, an expiry (default 7 days), and a maximum use count (default
1). Codes are 8 characters, uppercase alphanumeric, **excluding the ambiguous
glyphs `0 O 1 I L`** so they can be read aloud across a room.

**FR-M1-04** A user joins a household by submitting a code. On success a
membership is created with the code's granted role and `active` status, and the
code's use count increments. Distinct failures return distinct problem types:
`invite_not_found`, `invite_expired`, `invite_exhausted`, `invite_revoked`.

**FR-M1-05** An administrator can revoke an unused or partially used code. A
revoked code can never be reactivated.

**FR-M1-06** A member profile holds: display name, photo, birth date, a free
text relationship label (suggested values: Padre, Madre, Hijo, Hija, Hermano,
Hermana, Abuelo, Abuela, Tío, Tía, Otro) and a status of `active`, `invited` or
`inactive`. **Age is derived from birth date at read time and never stored.**

**FR-M1-07** A member can edit their own display name, photo and birth date. An
administrator can edit any member's relationship label and role, subject to
INV-R-01.

**FR-M1-08** An administrator can deactivate a member. Per INV-R-03 their
records remain.

### 6.2 Module 2 — Personal finance

Each member keeps an independent ledger. Nothing in this module is shared by
default; sharing is governed entirely by Module 3.

#### Categories

**FR-M2-01** The system seeds categories on household creation:

- **Income:** Salario, Negocio, Regalos, Otros
- **Expense:** Transporte, Comida, Educación, Entretenimiento, Salud, Otros,
  and the system category **`Aporte al hogar`**, which FR-M4-05 assigns to the
  expense it generates. It is seeded as a system category so a household cannot
  delete the category that derived records depend on.
- **Savings:** goals are user-created, not seeded
- **Debt:** creditor types are an enum, not categories

**FR-M2-02** A household can create, rename and archive its own categories.
Seeded categories cannot be deleted, only archived. Archiving hides a category
from pickers but preserves it on historical records.

#### Transactions

**FR-M2-03** A member can record an income or expense with: category, amount,
`occurred_on` date, and an optional note. The owning member is always the
authenticated member — **a member cannot write into another member's ledger**.

**FR-M2-04** A member can edit or delete their own transactions. Nobody can
edit or delete another member's transactions, including administrators.

**FR-M2-05** Transactions created automatically by another module (a household
contribution, per FR-M4-05) are marked with a source reference and **cannot be
edited or deleted directly** — they are managed through their originating
record. Attempting to do so returns `409 derived_record`.

**FR-M2-06** Amounts must be strictly positive. Direction is expressed by the
transaction kind, never by a negative amount.

#### Savings

**FR-M2-07** A member can create savings goals with a name, target amount and
optional target date. Example goals: Fondo de emergencia, Moto, Universidad,
Viaje.

**FR-M2-08** A member records deposits and withdrawals against a goal. The
goal's current balance is the sum of its entries; **it is derived, never stored
as a mutable field**.

**FR-M2-09** Progress is `balance / target`, capped for display at 100% but
reported truthfully in the API.

#### Debts

**FR-M2-10** A member can record a debt with a creditor type of `bank`,
`family`, `credit_card`, `addi` or `other`, a free text creditor label, the
original principal, an optional interest rate, and an optional monthly due day.

**FR-M2-11** A member records payments against a debt. Outstanding balance is
derived as `principal − sum(payments)`. A debt whose outstanding balance
reaches zero is automatically `paid`.

#### Loans between members

**FR-M2-12** A loan between two household members is **one row** naming a
lender and a borrower, with an amount, a lent date, an optional due date and a
status of `pending`, `partially_paid` or `paid`.

**FR-M2-13** The same row is read from both sides: the lender sees a
receivable, the borrower sees a payable. Recording a payment updates the single
row, so **the two views cannot disagree**.

**FR-M2-14** Either party may record a payment. Only the lender may cancel the
loan outright.

**FR-M2-15** A guest cannot be a lender or a borrower.

**FR-M2-16** Member loans are visible to both parties **regardless of either
party's visibility settings**. A debt between two people is a shared fact, and
a lender who cannot see a loan they made has been given a worse tool than a
notebook. Visibility settings govern whether *third* members see it.

### 6.3 Module 3 — Family transparency

The privacy model. Read `docs/visibility-rules.md` for the complete enforcement
specification; this section states the product requirements.

**FR-M3-01** Visibility is set **per module**, not per record and not per
viewer. The configurable modules are `income`, `expenses`, `savings` and
`debts`.

**FR-M3-02** Three levels:

| Level | Another member sees |
| ----- | ------------------- |
| `private` | Nothing. Not the total, not the count, not the existence. |
| `summary` | A single period total, and nothing else. |
| `public` | Every record, with categories, dates and notes. |

**FR-M3-03** Defaults on joining a household: `income`, `expenses` and
`savings` default to `summary`; **`debts` defaults to `private`**. Debt is the
most stigmatized financial fact in a family, so it starts closed.

**FR-M3-04** A summary is exactly one number per module per period:

- income → total income
- expenses → total expenses
- savings → total balance across all goals
- debts → total outstanding

**It is never a category breakdown, a record count, a date range, a largest
transaction, or a trend.** Any of those would let a viewer reconstruct detail.

**FR-M3-05** Because visibility is per module rather than per record, a summary
total is always the member's **true** total. There is no "visible subtotal"
concept and no ambiguity about what a number includes.

**FR-M3-06** Only the owning member can change their own visibility settings.
No role can change them for anyone else, and no role can read past them.

**FR-M3-07** Household contributions (Module 4) are **always visible to the
household** and are not configurable. See §6.4.

**FR-M3-08** The visibility settings screen shows each member, in plain
Spanish, what others currently see about them, including the disclosure
required by §8.4.

### 6.4 Module 4 — Household contribution

**FR-M4-01** An administrator opens a monthly contribution period with a target
amount. One period per household per calendar month.

**FR-M4-02** An administrator may record an expected contribution (a pledge)
per member. Pledges are optional; a period with no pledges still tracks actual
contributions against the household target.

**FR-M4-03** A member records a contribution to the open period with an amount,
a paid date and an optional note.

**FR-M4-04** The period dashboard reports the target, the total collected, the
percentage, and each member's contributed amount against their pledge — for
example, target `$2.000.000`, collected `$1.900.000`, 95%.

**FR-M4-05** Recording a contribution **also writes an expense transaction in
the contributing member's personal ledger**, in the same database transaction,
linked by foreign key. Either both rows exist or neither does. The generated
expense is a derived record per FR-M2-05.

**FR-M4-06** Deleting a contribution deletes its linked expense in the same
database transaction.

**FR-M4-07** Contribution amounts are **always visible to every household
member**, overriding any personal visibility setting. This is deliberate: the
household pot is shared money, and FR-M4-04 is unbuildable if members can hide
their share. This override is stated on the visibility settings screen so no
member discovers it by surprise.

**FR-M4-08** An administrator can close a period. A closed period accepts no
new contributions and its target cannot be edited.

### 6.5 Phase 1 dashboard

**FR-D1-01** The dashboard shows, for the current month: household income,
expenses and savings totals; contribution progress; each member's card with
whatever that member's visibility settings permit the viewer to see.

**FR-D1-02** Household totals are computed from **all** members, including
those set to Private. See §8.4 for why, and for the disclosure that makes this
acceptable.

**FR-D1-03** A member card shows nothing but the member's name, photo and
relationship when every one of their modules is Private.

---

## 7. Later phases — specified for coherence, not for implementation

These modules are summarized so Phase 1's data model does not paint them into a
corner. Each gets its own design document before it is built.

### 7.1 Module 5 — Smart market (Phase 2)

Record purchases with product, quantity, unit, price and date. From repeated
purchases of the same product, infer a **consumption rate** — 2 kg of rice
lasting 18 days is roughly 111 g/day — and predict depletion. Report the most
expensive categories per month and month-over-month change.

The hard part is inference quality, not CRUD. A purchase does not mean the
previous unit is exhausted, and household size varies. This module needs its
own design document covering the inference method, its confidence bounds, and
how it handles the cold start when there is one data point.

### 7.2 Module 6 — Home inventory (Phase 2)

What the household currently has, with states `available`, `low`, `out`. Fed by
purchases from M5 and decremented by the consumption model, correctable by hand.

### 7.3 Module 7 — Purchase planning (Phase 2)

A suggested shopping list from predicted depletion plus an estimated cost from
recent prices.

### 7.4 Module 8 — Household chores (Phase 3)

Recurring chores with daily, weekly, biweekly or monthly frequency, and an
automatic rotation that **balances cumulative load** rather than merely
alternating — the stated goal is preventing "Daniel did 10 chores, Papá did 2".
The fairness algorithm needs its own design; weighting chores by effort and
handling absences are the real questions.

### 7.5 Module 9 — Notifications (Phase 3)

Web Push. Chore due today, debt installment due tomorrow, an inventory item
out, household contribution due in three days. **Redis and Celery enter here.**

Note for planning: iOS delivers Web Push only to PWAs the user has added to the
Home Screen, on iOS 16.4+. The onboarding for this needs designing, and an
in-app notification center is the fallback for members who never install.

### 7.6 Module 10 — Executive dashboard and AI agent (Phase 4)

Full household financial summary, top expense breakdown, goal progress. Then a
natural-language agent answering questions such as "what did we spend most on
this year", "who has contributed most", "how much would we save cutting snacks
20%".

**The agent inherits the visibility model without exception.** It answers as
the asking member and can never surface a fact that member could not read
directly. This constraint must be enforced at the data-access layer the agent
queries through, not by prompting.

---

## 8. Cross-cutting concerns

### 8.1 Visibility enforcement

The resolver answers `resolve(viewer, owner, module) → FULL | SUMMARY | NONE`:

1. Viewer is the owner → `FULL`.
2. Viewer's role is `guest` → `NONE` for any per-member module.
3. Otherwise the owner's stored setting for that module: `public` → `FULL`,
   `summary` → `SUMMARY`, `private` → `NONE`.

Three mechanisms keep this honest:

- **It is a required FastAPI dependency, not a call you remember to make.** A
  read route declares its policy in its signature.
- **A route-coverage test** enumerates `app.routes` and fails CI if any read
  route under the finance namespace lacks a declared visibility policy.
  Forgetting becomes a build failure rather than a data leak.
- **Denials return a uniform `403`.** Never `404` for one case and `403` for
  another — the difference between "does not exist" and "you may not see it" is
  itself information.

Each module has two response schemas, a detail schema and a summary schema.
`SUMMARY` serializes through the summary schema, which structurally cannot
carry per-record fields.

### 8.2 Money

`amount_minor BIGINT` plus an ISO-4217 currency code, with minor-unit count
looked up per currency (`COP` → 0). No float, no `double`, no JavaScript
`Number` arithmetic on totals. Amounts are strictly positive; direction lives
in the record's kind.

### 8.3 Dates

Financial events carry a plain `DATE`. Audit fields carry `timestamptz` in UTC.
Period boundaries are computed in the household's timezone, so "this month"
means what the family means by it.

### 8.4 The derivability disclosure

If a household total is true and three of four members are Public, the fourth
member's figure is recoverable by subtraction. This is inherent to publishing
both a total and its parts; no implementation choice removes it.

**Decision:** household totals remain true, and the visibility settings screen
states plainly:

> Los totales del hogar incluyen a todos. Tu configuración controla si los demás
> ven tus números individuales, no si cuentas en el total del hogar.

Derivable is survivable. Surprising is not. The alternative — suppressing
totals when too few members are visible — was considered and rejected because
it breaks the household dashboard, which is the reason the app exists.

### 8.5 Errors

RFC 9457 `application/problem+json`. Every error carries a stable machine
readable `type` slug. Validation errors identify the offending field. Privacy
denials are indistinguishable from one another by design.

---

## 9. Non-functional requirements

| Area | Requirement |
| ---- | ----------- |
| Performance | Dashboard responds in under 400 ms at p95 for a 6-member household with 3 years of data. |
| Scale | Designed for one household of up to 10 members. Multi-tenant correctness is required (every query is household-scoped); multi-tenant *scale* is not. |
| Availability | Best effort. No HA requirement. |
| Backups | Nightly Postgres dump, retained 30 days. This holds a family's entire financial history; losing it is unrecoverable in a way losing code is not. |
| Security | argon2id password hashing, short-lived access tokens with rotating refresh tokens, household scoping enforced server-side on every query, rate limiting on auth and invite redemption. |
| Accessibility | WCAG 2.1 AA contrast, 44 px minimum touch targets, full keyboard navigation, labelled form controls. |
| Privacy | No third-party analytics. No financial data leaves the deployment. |

---

## 10. Out of scope

Explicitly excluded from every phase in this document:

- Bank account linking, transaction import, or open banking integrations.
- Multi-currency within a single household.
- Native iOS or Android applications.
- Offline writes and conflict resolution.
- Multiple households per user.
- Tax reporting or regulatory compliance features.
- Real payment processing. The app records that money moved; it never moves it.

---

## 11. Decision log

| # | Decision | Rationale | Rejected alternative |
| - | -------- | --------- | -------------------- |
| 1 | Phase 1 is M1–M4 | The transparency model is the differentiator and the foundation every other module reads through | Starting with groceries; a thin slice of all ten |
| 2 | FastAPI + Postgres + Next.js | Matches the owner's backend and AI expertise; the API boundary makes a future React Native client additive rather than a rewrite; Phase 4's agent stays in Python | Next.js full-stack; Supabase; the full original stack with Redis and Celery on day one |
| 3 | Redis and Celery deferred to Phase 3 | Nothing before scheduled notifications needs a job queue | Provisioning all infrastructure upfront |
| 4 | Visibility is per module | Simple mental model, one settings screen, and it guarantees a summary total is the true total | Per-record overrides; a single global dial; a per-viewer matrix |
| 5 | Cross-party money is one row, auto-mirrored | Two synchronized rows drift; one row cannot disagree with itself | Independent lists; full double-entry accounting; mirrored-with-confirmation |
| 6 | Service-layer resolver, not RLS | The Summary level is aggregation, not row filtering — RLS cannot express "you may see the sum but not the rows", so RLS would cost its own complexity *and* still need service code | Postgres RLS; materialized summary snapshots on day one |
| 7 | Admin does not override privacy | An administrator who can read everything makes the privacy model theatre, and members will enter fake numbers | Admin as household superuser |
| 8 | Contributions are always household-visible | Shared money; FR-M4-04 is unbuildable otherwise | Making contributions configurable like other modules |
| 9 | Household totals stay true, derivability disclosed | Suppressing totals breaks the dashboard the product exists for | Suppression below a visibility threshold |
| 10 | Member loans always visible to both parties | A lender who cannot see their own loan has a worse tool than a notebook | Applying the owner's visibility setting to loans |

---

## 12. Open questions

Non-blocking for Phase 1. Each needs an answer before the phase named.

1. **Phase 2:** How does the consumption model handle its cold start, when a
   product has been purchased exactly once and no rate can be inferred?
2. **Phase 3:** Should chore fairness weight chores by effort, and how are
   absences (travel, illness) handled without the rotation punishing the
   remaining members?
3. **Phase 3:** What is the onboarding for iOS Web Push, given it requires the
   PWA to be added to the Home Screen?
4. **Phase 4:** Does the AI agent answer only from the asking member's readable
   scope, or may it answer aggregate questions that mix readable and unreadable
   data as long as it emits no unreadable fact? The former is safer and is the
   default until decided otherwise.
