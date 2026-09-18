# Glossary — Spanish ↔ English

The product speaks Spanish. The code speaks English. This table is the only
sanctioned mapping between them.

**Why this document exists:** without a fixed mapping, the same concept becomes
`aporte`, `contribution`, `payment`, and `quota` in four different files, and
nobody can grep for anything. Pick from this table or add a row — never invent
a synonym in passing.

---

## 1. Household and people

| Spanish (UI) | English (code) | Notes |
| ------------ | -------------- | ----- |
| Hogar | `household` | The family unit. Never `family` in code — `family` is ambiguous with the token family in auth. |
| Miembro | `member` / `household_member` | A person **within** a household. |
| Usuario | `user` | An authentication account. A user *has* a membership; they are not the same thing. |
| Código de invitación | `invite_code` | |
| Rol | `role` | |
| Administrador | `admin` | Logistics role. **Not** a superuser. |
| Adulto | `adult` | |
| Adolescente | `teen` | |
| Invitado | `guest` | Read-only observer. |
| Relación / Parentesco | `relationship` | Free text: Padre, Madre, Hijo… |
| Estado | `status` | `active` / `invited` / `inactive` |

**Relationship labels** stay Spanish in the database — they are user-entered
free text, not an enum. Suggested values: Padre, Madre, Hijo, Hija, Hermano,
Hermana, Abuelo, Abuela, Tío, Tía, Otro.

---

## 2. Money

| Spanish (UI) | English (code) | Notes |
| ------------ | -------------- | ----- |
| Ingreso | `income` | |
| Gasto | `expense` | |
| Movimiento | `transaction` | Covers income and expense. |
| Categoría | `category` | |
| Monto | `amount_minor` | Always integer minor units. |
| Fecha | `occurred_on` | The `DATE` the money moved. Not `date` (shadows a builtin), not `created_at`. |
| Nota | `note` | |
| Ahorro | `savings` | The module. |
| Meta de ahorro | `savings_goal` | One goal: Moto, Universidad, Viaje. |
| Abono / Retiro | `savings_entry` (`deposit` / `withdrawal`) | |
| Saldo | `balance_minor` | Always derived, never stored. |
| Prioridad | `priority` | On a savings goal: `alta` / `media` / `baja`. Genuine user input, stored. |
| Días restantes | `days_remaining` | Derived from `target_date`, never stored. Negative once the deadline has passed. |
| Meta alcanzada | `state: "completado"` | `balance_minor >= target_amount_minor`. Takes priority over a passed deadline in the goal card's derived label. |
| Plazo vencido | `is_overdue` | Derived: `target_date` has passed and the goal is not yet `completado`. |
| Deuda | `debt` | Owed to an **external** creditor: bank, Addi, credit card. |
| Acreedor | `creditor` | |
| Pago | `payment` | Against a debt or a loan. |
| Saldo pendiente | `outstanding_minor` | Derived. |
| Préstamo | `member_loan` | Between two **household members**. Never plain `loan` — the distinction from `debt` is the whole point. |
| Presté dinero | lender perspective | The caller is `lender_member_id`. |
| Me prestaron | borrower perspective | The caller is `borrower_member_id`. |
| Prestamista | `lender` | |
| Deudor | `borrower` | |
| Pendiente / Pagado | `pending` / `paid` | |
| Resumen mensual | `monthly_summary` | Composes income, expenses, savings deposits and debt payments for one period into a single derived figure. |
| Restante | `remaining_minor` | `income_minor - expenses_minor - saved_minor - debt_payments_minor`. Derived, never stored. |
| Saludable / Ajustado / En descubierto | `healthy` / `tight` / `overspent` | The monthly summary's derived `status`. |
| Método de pago | `payment_method` | How a transaction or debt payment was paid: cash, transfer, card, etc. |
| Recurrente | `is_recurring` | Whether a transaction repeats. |
| Frecuencia (movimiento) | `frequency` (on `Transaction`) | `monthly` / `once` / `biweekly`, shown as Mensual / Único / Quincenal. Set only when `is_recurring` is true. **Not** the same enum as "Frecuencia (tarea)" in §5B — see the disambiguation note there. |

### The `debt` vs `member_loan` distinction

A **`debt`** is owed to someone outside the household — a bank, Addi, a credit
card. It lives in one member's ledger.

A **`member_loan`** is between two members of the same household. It is a
single row naming both, and the two sides can never disagree.

They are different tables with different rules. Conflating them in code or in
conversation is the single most likely source of confusion in this project.

---

## 3. Household contribution

| Spanish (UI) | English (code) | Notes |
| ------------ | -------------- | ----- |
| Aporte al hogar | `contribution` | Money a member puts into the shared pot. |
| Cuota esperada | `contribution_pledge` | What a member is *expected* to contribute. |
| Meta del hogar | `goal_amount_minor` | The period target. |
| Recaudado | `collected_minor` | Actually contributed so far. |
| Periodo | `contribution_period` | One calendar month. |
| Abierto / Cerrado | `open` / `closed` | |
| Gasto del hogar | `household_expense` | A shared expense: rent, utilities, groceries. Lives in the household ledger, **not** in anyone's personal ledger. |
| Pozo común | `pot` | The collected, unspent contribution money. `pot_balance` is derived, never stored. |
| Fondeo | `funding` | `pot` or `member` — where the money for a household expense came from. |
| Aporte en especie | `in_kind` contribution | A member paid a household expense from their own pocket and it counts as their contribution. |
| Saldo del pozo | `pot_balance` | Non-in-kind contributions minus pot-funded expenses. |

**Never** call a `household_expense` a `transaction`. A `transaction` is a row
in one member's personal ledger; a `household_expense` belongs to the household.
A member-funded household expense *generates* a transaction, but they are two
different rows in two different tables with two different visibility rules.

### Cuotas (installments)

| Spanish (UI) | English (code) | Notes |
| ------------ | -------------- | ----- |
| Cuota | `installment` | One scheduled payment of a debt. |
| Número de cuotas | `installments_total` | |
| Valor de la cuota | `installment_amount_minor` | |
| Primera cuota | `first_installment_on` | |
| Próxima cuota | `next_installment_on` | **Derived**, never stored. |
| Cuotas pagadas | `installments_paid` | Derived from payments, never a counter. |
| En mora | `is_overdue` | Derived. |

**Never** call a contribution a `payment` or a `quota`. `payment` means a
payment against a debt or loan; `quota` means nothing here.

---

## 4. Transparency

| Spanish (UI) | English (code) | Notes |
| ------------ | -------------- | ----- |
| Transparencia | visibility model | The module name in the product. |
| Visibilidad | `visibility` | |
| Privado | `private` | Others see nothing at all. |
| Resumen | `summary` | Others see exactly one total. |
| Público | `public` | Others see every record. |
| Nivel | `level` | |

`FULL` / `SUMMARY` / `NONE` are the **resolved** levels the resolver returns.
`public` / `summary` / `private` are the **stored** settings. They are related
but not interchangeable — a `public` member still resolves to `NONE` for a
guest.

---

## 5. Later phases

Recorded now so Phase 2 and 3 do not invent competing terms.

| Spanish | English | Module |
| ------- | ------- | ------ |
| Mercado | `market` / `purchase` | M5 |
| Producto | `product` | M5 |
| Cantidad | `quantity` | M5 |
| Consumo | `consumption` | M5 |
| Predicción | `depletion_forecast` | M5 |
| Inventario | `inventory` | M6 |
| Disponible / Bajo / Agotado | `available` / `low` / `out` | M6 |
| Planeación | `shopping_plan` | M7 |
| Notificación | `notification` | M9 |

---

## 5B. Tareas del hogar (M8)

Fully specified in the spec §7.4, so these names are binding, not provisional.

| Spanish (UI) | English (code) | Notes |
| ------------ | -------------- | ----- |
| Tarea del hogar | `chore` | **Never** `task` — `task` means a unit of implementation work, and confusing the two in a repo full of implementation plans would be genuinely painful. |
| Frecuencia (tarea) | `frequency` (on `Chore`) | `daily` / `weekly` / `biweekly` / `monthly`. **Not** the same enum as "Frecuencia (movimiento)" below — see the disambiguation note. |
| Diaria / Semanal / Quincenal / Mensual | the four values above | |
| Esfuerzo | `effort_points` | 1–10. The currency of the fairness system. |
| Asignación | `chore_assignment` | One chore, one member, one due date. |
| Ciclo | `chore_cycle` | The date range a batch of assignments covers. |
| Balance de esfuerzo | `effort_balance` | Derived over a rolling window. Never stored. |
| Ventana | `effort_window_days` | Household setting, default 60. |
| Pendiente / Hecha / Omitida / Reasignada | `pending` / `done` / `skipped` / `reassigned` | |
| Ausencia | `member_absence` | A date range during which a member is not assigned. |
| Ajuste de esfuerzo | `effort_adjustment` | A manual, attributed correction by an administrator. |
| Equidad | `fairness` | The property. The mechanism is `effort_balance`. |

**Do not use `rotation`.** It survives from an earlier sketch and describes a
round-robin, which is precisely the design that was rejected — the system
assigns by lowest effort balance, and calling that a rotation invites someone
to "simplify" it back into one.

**"Frecuencia" collision.** Two unrelated enums both surface in the UI as
plain "Frecuencia": the chore's repeat interval (`daily` / `weekly` /
`biweekly` / `monthly`, §5B) and a transaction's recurrence interval
(`monthly` / `once` / `biweekly`, §2). They live on different forms — the
chore-creation form and the transaction form — so a user never sees both
labels at once, which is why the UI copy is left as-is. In documentation and
in any place where they might appear together (e.g. this glossary), use
"Frecuencia (tarea)" and "Frecuencia (movimiento)" to keep them apart.

---

## 6. Terms with no translation

Kept in Spanish everywhere, code included:

- **Addi** — a Colombian buy-now-pay-later provider. It is a proper noun and a
  value of `debt_creditor_type`.
- **COP** — Colombian peso, ISO 4217. Zero decimal places in practice.
- Relationship labels (§1).
- Seeded category names: `Salario`, `Negocio`, `Regalos`, `Transporte`,
  `Comida`, `Educación`, `Entretenimiento`, `Salud`, `Otros`,
  `Aporte al hogar`. These are seeded **data**, not identifiers, so they stay
  in the user's language.
