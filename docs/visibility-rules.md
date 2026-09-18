# Visibility Rules — Enforcement Specification

**This is the most security-sensitive document in the project.** If any other
document contradicts it, this one wins. Implementers: read it fully before
writing a single read endpoint.

Related: `docs/superpowers/specs/2026-09-02-family-hub-design.md` §6.3, §8.1, §8.4

---

## 1. The model

Every member sets a visibility level **per module**. There is no per-record
override, no per-viewer matrix, and no global dial.

| Module | Key | Default on join |
| ------ | --- | --------------- |
| Income | `income` | `summary` |
| Expenses | `expenses` | `summary` |
| Savings | `savings` | `summary` |
| Debts | `debts` | **`private`** |

Levels:

| Level | Meaning |
| ----- | ------- |
| `private` | Another member sees nothing: not the total, not the count, not that any record exists. |
| `summary` | Another member sees exactly one number for the period. Nothing else. |
| `public` | Another member sees every record with all its fields. |

---

## 2. The resolver

```
resolve(viewer: Member, owner: Member, module: Module) -> Level

  if viewer.household_id != owner.household_id:  return NONE
  if viewer.id == owner.id:                      return FULL
  if viewer.role == GUEST:                       return NONE
  setting = visibility_settings[owner.id][module]   # defaults applied on join
  return {public: FULL, summary: SUMMARY, private: NONE}[setting]
```

Note the ordering. Cross-household is checked **first**, self **second**. A
member always sees their own data at `FULL` regardless of their own settings —
settings describe what *others* see, never what you see about yourself. A
member who sets Debts to Private must still be able to use their own debt
screen.

### 2.1 Rules the resolver encodes

- **VR-01** No role grants visibility. An administrator resolves identically to
  a teen. There is no branch on `viewer.role` other than the `GUEST` denial.
- **VR-02** A guest resolves to `NONE` for every per-member module, even when
  the owner is `public`. Public means public to the household; a guest is a
  visitor.
- **VR-03** A member's own data is always `FULL` to them.
- **VR-04** Cross-household access is `NONE` and is additionally blocked by
  household scoping on every query. Two independent barriers.
- **VR-05** A missing settings row resolves to the module default in §1, never
  to `public`. **Fail closed.** If the lookup errors, resolve to `NONE`.

---

## 3. What SUMMARY may return

A summary response carries **exactly one number** plus the period it covers.

| Module | The one number |
| ------ | -------------- |
| `income` | Sum of income transactions in the period. |
| `expenses` | Sum of expense transactions in the period. |
| `savings` | Sum of all goal balances as of the period end. |
| `debts` | Sum of outstanding balances as of the period end. |

### 3.1 Forbidden in a summary response

Every item below leaks reconstructable detail and must not appear:

- Record counts (`"12 transacciones"` bounds the individual amounts).
- Category breakdowns of any kind.
- Minimum, maximum, average, median, or any other statistic.
- First or last transaction date, or any date other than the period bounds.
- Goal names, goal counts, creditor names, creditor types, or notes.
- Trend or comparison figures against another period.
- Pagination metadata, `has_more` flags, or `ETag` values derived from row
  content.
- Field presence signals — the summary schema must have a fixed shape whether
  the member has one record or a thousand.

### 3.2 The zero case

A member with no records and a member whose records total zero both return
`0`. A member at `private` returns **no field at all**, not `0` and not `null`.
`null` would distinguish "private" from "empty", which is itself a disclosure.

---

## 4. Enforcement mechanics

### 4.1 Required dependency

Visibility is a FastAPI dependency, not a function someone remembers to call:

```python
@router.get("/members/{member_id}/expenses")
async def list_expenses(
    scope: Annotated[VisibilityScope, Depends(visibility_for("expenses"))],
    ...
) -> ExpenseDetailResponse | ExpenseSummaryResponse: ...
```

The dependency resolves the level and raises before the handler body runs when
the level is `NONE`.

### 4.2 Two schemas, never one

Each module defines `XDetailResponse` and `XSummaryResponse` as separate
Pydantic models. `SUMMARY` serializes through the summary model, which
**structurally cannot** carry per-record fields. Do not implement summary as a
detail model with fields set to `None` or excluded at serialization time —
one forgotten `exclude` becomes a breach. Separate types make the leak a type
error.

### 4.3 Route coverage test

A test enumerates `app.routes`, filters to `GET` routes under the finance
namespace, and asserts each declares a visibility dependency in its dependant
tree. **Adding a read endpoint without a policy fails CI.** This converts the
class of "someone forgot" from a silent data leak into a red build.

Routes legitimately exempt (household aggregates, own-data routes) are listed
in an explicit allowlist inside the test, so exemption is a deliberate,
reviewable act rather than an omission.

### 4.4 Uniform denial

All denials return the same `403` with `type: "not_visible"` and an identical
body. Never `404` in one case and `403` in another — the difference between
"no such member" and "you may not see this member" is itself information.

Denials must also be **timing-uniform enough** not to distinguish "member does
not exist" from "member is private" — resolve the level before any expensive
query, so both paths return without touching finance tables.

---

## 5. Rules that override the resolver

Four cases sit outside the per-module model. All are deliberate.

### 5.1 Member loans (FR-M2-16)

A loan is visible to **both parties in full**, regardless of either party's
settings. A lender who cannot see a loan they made has a worse tool than a
notebook.

For a **third** member, a loan resolves against the *borrower's* `debts`
setting — a loan is a debt from the household's point of view, and the
borrower is the one exposed by it.

### 5.2 Household contributions (FR-M4-07)

Contribution amounts are visible to every household member, always, and are
not configurable. The household pot is shared money.

**The expense transaction generated by a contribution (FR-M4-05) is a normal
transaction** and resolves against the member's `expenses` setting like any
other. So the household always sees "Papá contributed $1.000.000" via the
contributions endpoint, while Papá's expense ledger stays as private as he set
it. The same fact, two surfaces, two different rules — implementers must not
"simplify" this by making the derived expense always visible.

### 5.3 Household expenses (FR-M4-15)

The household ledger is visible to every household member, always, and is not
configurable. Same reasoning as contributions: this is shared money, and a
household that cannot see where its own pot went has no ledger at all.

This covers the amount, the category, the date, the note, **and who paid it**
when it was member-funded. "Mamá paid the electricity bill" is household
information, not personal information.

**But the mirrored personal expense (FR-M4-16) is a normal transaction** and
resolves against the payer's `expenses` setting — exactly as in §5.2. The
household sees the bill on the household ledger; whether that same row is
visible inside Mamá's personal expense list is her setting to make.

This is the second instance of the same shape, so state the rule generally:
**a fact recorded on a shared surface is shared; the personal row it generates
stays governed by its owner.**

A guest sees household expenses, because a guest sees household aggregates
(§5 of the spec's role table). A guest still sees no per-member module.

### 5.3.1 Mirrored rows that cross modules

Some mirrored rows land in a **different module** from the record they
mirror. A savings withdrawal lives in `savings` but its mirror is an income
row, so it resolves against the member's `income` setting. Someone who may see
your income in detail but not your savings learns that *a withdrawal of this
amount happened on this date* — which is exactly what the member asked for
when they asked that withdrawals count as income.

They must learn nothing more. A cross-module mirror therefore carries **no
name and no note**: only the reserved category ("Retiro de ahorro"), the
amount and the date. Copying the goal's name or the note written in savings
into the income row would leak the savings module through the income one.

Family loans work the same way. The loan itself follows §5.1, but lending
writes an expense row for the lender and an income row for the borrower, and
each repayment writes the reverse. Those rows resolve against `expenses` and
`income`, so they show that *money moved under "Préstamo familiar"* and never
who the other party was or what the loan's note says. A member whose `debts`
are private but whose income is visible in detail does reveal that they
received a family loan — the unavoidable cost of counting it as income, which
is what was asked for.

### 5.4 Chores (FR-M8-15)

Chores, assignments, completion history and effort balances are visible to the
whole household. There is no visibility setting on any of them, and no plan to
add one.

The privacy model exists because **money** is private. Housework is the
opposite: its entire purpose is being seen and counted, and a private chore
ledger could not settle the argument the module was built to settle. A member
who could hide their effort balance would break fairness for everyone else,
because the assignment algorithm reads exactly that number.

Absences are visible too — the household needs to know why the rota changed.
The **reason** field is optional precisely because "I am away" is household
business while *why* may not be.

---

## 6. The derivability disclosure

Household totals (`FR-D1-02`) are computed from **all** members, including
private ones. With three of four members public, the fourth is recoverable by
subtraction.

This is inherent to publishing a total alongside its parts. No implementation
removes it. The chosen mitigation is **disclosure, not suppression**: the
visibility settings screen states, in Spanish:

> Los totales del hogar incluyen a todos. Tu configuración controla si los demás
> ven tus números individuales, no si cuentas en el total del hogar.

Implementers must not "fix" this by excluding private members from household
totals. That would make the dashboard wrong — which is worse, and would create
a *new* leak, since a total that shifts when someone changes their setting
reveals that they changed it.

---

## 7. The visibility matrix test

The single most important test in the codebase. Parametrized across the full
cross product:

- viewer role ∈ {admin, adult, teen, guest}
- viewer relationship ∈ {self, other member, member of another household}
- owner setting ∈ {private, summary, public}
- module ∈ {income, expenses, savings, debts}
- endpoint ∈ {list, detail-by-id, summary, dashboard card}

For each cell the test asserts the **exact** response: status code, and for
200s the exact set of field names present. Asserting field names rather than
just values is what catches a leak added later by an unrelated feature.

Additional required cases:

- A `private` member and a member with zero records are indistinguishable in
  every response (§3.2).
- Denials are byte-identical across "member does not exist", "member is
  private", and "member is in another household".
- A loan is visible to both parties when both have `debts` set to `private`.
- A contribution is visible to the household when the contributor has
  `expenses` set to `private`, while the derived expense is not.
- Changing a setting takes effect on the next request with no caching window.

---

## 8. Implementer checklist

Before merging any read endpoint touching member data:

- [ ] The route declares a visibility dependency.
- [ ] Detail and summary are separate Pydantic models.
- [ ] The summary model carries no field from §3.1.
- [ ] Denial returns the uniform `403 not_visible`.
- [ ] The level is resolved before any finance table is queried.
- [ ] The matrix test covers the new endpoint.
- [ ] No response header, `ETag`, or log line carries data the viewer cannot read.
