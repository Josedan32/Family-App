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
| Tarea del hogar | `chore` | M8 — **never** `task`, which means a unit of implementation work |
| Frecuencia | `frequency` | M8 |
| Sorteo / Rotación | `rotation` | M8 |
| Equidad | `fairness` / `load_balance` | M8 |
| Notificación | `notification` | M9 |

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
