# Design System — Responsive & iOS-First

The household uses iPhones. The app is a website. Everything below exists
because that combination has sharp edges that desktop-first development does
not reveal until someone opens it on a phone.

Related: `docs/superpowers/specs/2026-09-02-family-hub-design.md` §4

---

## 1. Non-negotiables

| Rule | Why |
| ---- | --- |
| **`100dvh`, never `100vh`** | On iOS Safari `100vh` is the height *without* the toolbar. Use `vh` and the bottom of every full-height screen sits under the browser chrome. `dvh` tracks the visible viewport. |
| **Respect safe areas** | `padding-bottom: env(safe-area-inset-bottom)` on the bottom nav, `env(safe-area-inset-top)` on the header. Otherwise the home indicator sits on top of the primary action. |
| **44 × 44 px minimum touch target** | Apple HIG minimum, and also the WCAG AA target size. Applies to icon buttons, which are the ones that get this wrong. |
| **`font-size: 16px` minimum on inputs** | Anything smaller makes iOS Safari zoom on focus and the layout never fully recovers. |
| **No hover-only affordances** | Touch has no hover. Any information behind `:hover` is invisible on the primary device. |
| **`-webkit-tap-highlight-color: transparent`** plus a real `:active` state | The default grey flash looks broken; removing it without an `:active` state makes taps feel dead. |
| **`overscroll-behavior: contain` on scroll containers** | Prevents the whole page rubber-banding when a list is scrolled to its end. |
| **`touch-action: manipulation`** | Removes the 300 ms double-tap-zoom delay on buttons. |
| **No `position: fixed` inside a scrolling container** | iOS Safari positions these unpredictably during momentum scroll. Fixed elements attach to the viewport root only. |

---

## 2. Layout

Mobile-first. Breakpoints are Tailwind defaults; only two matter in Phase 1.

| Width | Layout |
| ----- | ------ |
| `< 768px` | Single column. Bottom tab bar. Full-screen sheets for forms. Cards stack. |
| `≥ 768px` | Two columns on the dashboard. Sidebar replaces the tab bar. Forms become centred modals, max width `32rem`. |
| `≥ 1280px` | Content capped at `72rem` and centred. No third column — more columns would mean inventing content to fill them. |

Content gutter `1rem` on mobile, `1.5rem` from `md` up. Vertical rhythm is a
`0.25rem` scale; spacing values outside that scale are a mistake.

---

## 3. Navigation

**Mobile: bottom tab bar**, five items, because that is where thumbs are and
what iOS users expect.

| Tab | Route | Icon |
| --- | ----- | ---- |
| Inicio | `/` | home |
| Finanzas | `/finanzas` | wallet |
| Aportes | `/aportes` | users-round |
| Hogar | `/hogar` | house |
| Ajustes | `/ajustes` | settings |

The tab bar is `position: fixed; bottom: 0` with safe-area padding, and the
page reserves `padding-bottom` equal to its height plus the inset.

**Desktop: left sidebar**, same five destinations, labels always visible.

Primary create actions live in a floating action button above the tab bar on
mobile, and inline in section headers on desktop.

---

## 4. Color tokens

Defined as CSS custom properties on `:root`, overridden under
`@media (prefers-color-scheme: dark)`. Semantic names only — no component may
reference a raw hex value.

**These names are binding.** They come from the published Hoja de estilo
(`docs/design-index.md`), not from this document's first draft — an earlier
version of this file called them `--surface-sunken` and `--brand-contrast`, and
using those would leave half the interface with no background.

```css
[data-theme="light"] {
  --bg:            #FAFAF9;
  --surface:       #FFFFFF;
  --sunken:        #F5F5F4;
  --border:        #E7E5E4;
  --text:          #1C1917;
  --text-muted:    #78716C;

  --brand:         #0F766E;
  --brand-pressed: #0B5B55;   /* :active — there is no hover state */
  --brand-on:      #FFFFFF;

  --income:        #15803D;
  --expense:       #B91C1C;
  --savings:       #1D4ED8;
  --debt:          #C2410C;

  --private:       #78716C;   /* the locked state, deliberately grey */
  --private-panel: #F5F5F4;
  --skeleton:      #E7E5E4;

  --danger:        #B91C1C;
  --warning:       #A16207;
  --success:       #15803D;
}

[data-theme="dark"] {
  --bg:            #1C1917;
  --surface:       #292524;
  --sunken:        #211E1B;
  --border:        #44403C;
  --text:          #FAFAF9;
  --text-muted:    #A8A29E;

  --brand:         #2DD4BF;
  --brand-pressed: #14B8A6;
  --brand-on:      #10312E;

  --income:        #4ADE80;
  --expense:       #F87171;
  --savings:       #60A5FA;
  --debt:          #FB923C;

  --private:       #A8A29E;
  --private-panel: #211E1B;
  --skeleton:      #3B3633;
}
```

Note `--sunken` in dark is `#211E1B`, **not** the same value as `--bg`. An
earlier draft of this file made them identical, which renders every sunken
panel invisible in dark mode. The design caught it.

**Every pairing must hit WCAG AA 4.5:1 for text and 3:1 for UI boundaries, in
both schemes.** This is checked, not assumed.

Color never carries meaning alone: income and expense also differ by sign,
icon, and label, because roughly 1 in 12 men has a color vision deficiency and
the household has men in it.

---

## 5. Typography

System font stack — it renders instantly, matches the OS, and needs no
download budget:

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;
```

| Token | Size / line-height | Use |
| ----- | ------------------ | --- |
| `display` | 2rem / 1.2, 700 | The one big number on a screen |
| `title` | 1.25rem / 1.3, 600 | Section headers |
| `body` | 1rem / 1.5, 400 | Everything |
| `label` | 0.875rem / 1.4, 500 | Form labels, table headers |
| `caption` | 0.75rem / 1.4, 400 | Timestamps, helper text |

**Monetary figures use tabular numerals** (`font-variant-numeric: tabular-num`).
Without it, columns of amounts visibly jitter and comparison gets harder.

---

## 6. Money presentation

| Rule | Detail |
| ---- | ------ |
| Formatting | `Intl.NumberFormat('es-CO', {style:'currency', currency:'COP', maximumFractionDigits:0})` → **`$ 2.000.000`, with the space after the symbol kept.** The design uses it throughout. Do **not** strip whitespace from the formatter's output — an earlier draft of Plan 4's `formatMoney` did exactly that. |
| Negative | `−$ 890.000` — true minus (U+2212) **before** the symbol, space after it. |
| Source | The API sends `amount_minor` integers. The client formats. **The client never does arithmetic on money** — totals come from the server, where they are computed in integers. |
| Input | `inputmode="numeric"`, live thousands grouping as the user types, caret preserved on reformat. No spinner arrows, no `type="number"` (its mobile keyboard and validation are both wrong for currency). |
| Emphasis | Amounts are the largest text in their row. A transaction row is amount-first in the visual hierarchy, description second. |
| Sign | Income `+$50.000` in `--income`, expense `−$50.000` in `--expense`, with the true minus sign `−` (U+2212), not a hyphen. |

---

## 7. Privacy UI

The visibility model only works if members understand it at a glance. It gets
first-class components.

### `<VisibilityBadge level>`

| Level | Label | Icon | Color |
| ----- | ----- | ---- | ----- |
| `private` | Privado | lock | `--private` |
| `summary` | Resumen | eye-off | `--text-muted` |
| `public` | Público | eye | `--brand` |

### `<PrivateBlock member?>`

Renders where a private module would appear on another member's card. A muted
panel on `--private-panel` reading **"Privado"** with a lock icon — **not** a
blurred number, not a skeleton, not a `$—`. A blurred or placeholder figure
invites people to guess at a magnitude, and a skeleton implies data is loading
and will arrive.

**When the owner is known, a second line names them:**

> Privado
> *Julián decidió no compartir este monto*

That line matters more than it looks. "Privado" alone reads as the app hiding
something; naming the person reframes it as *their decision, respected* — which
is exactly what it is, and the difference between a member feeling surveilled
and a member feeling safe entering real numbers.

The lock icon and the word say the same thing twice on purpose, so colour never
carries the message alone.

### The settings screen

Shows each of the four modules with its level, and beneath them, in plain
Spanish, exactly what the household currently sees. It must render both
disclosures verbatim from the API (`/me/visibility`):

> Los totales del hogar incluyen a todos. Tu configuración controla si los demás
> ven tus números individuales, no si cuentas en el total del hogar.

> Los aportes al hogar siempre son visibles para toda la familia.

Copy lives with the rules, not in the component, so the two cannot drift apart.

---

## 8. Component inventory (Phase 1)

**Primitives** — `Button` (primary / secondary / ghost / danger), `Input`,
`MoneyInput`, `Select`, `DatePicker` (native `<input type="date">` on mobile;
iOS's own picker beats anything custom), `Textarea`, `Switch`, `Badge`,
`Avatar`, `Card`, `Sheet` (full-screen on mobile, modal ≥ md), `Tabs`,
`EmptyState`, `Skeleton`, `Toast`.

**Domain** — `MoneyDisplay`, `TransactionRow`, `TransactionForm`, `CategoryPill`,
`GoalCard` (with progress ring), `DebtCard`, `LoanCard` (renders from the
caller's perspective — receivable or payable from the same row), `MemberCard`,
`MemberAvatarGroup`, `ContributionProgress`, `VisibilityBadge`,
`VisibilitySettingsForm`, `PrivateBlock`, `PeriodSelector`.

**Layout** — `AppShell`, `BottomTabBar`, `Sidebar`, `PageHeader`, `FAB`.

---

## 9. Screen inventory (Phase 1)

| Route | Screen |
| ----- | ------ |
| `/login`, `/registro` | Auth |
| `/onboarding/hogar` | Create a household or join with a code |
| `/` | Dashboard — household totals, contribution progress, member cards |
| `/finanzas` | Own ledger: tabs for Ingresos, Gastos, Ahorros, Deudas |
| `/finanzas/nuevo` | Create a transaction (sheet) |
| `/finanzas/prestamos` | Loans between members, both perspectives |
| `/aportes` | Current contribution period, per-member progress, record a contribution |
| `/hogar` | Members, roles, invite codes |
| `/hogar/miembros/[id]` | Another member's finances, rendered at the resolved level |
| `/ajustes/privacidad` | The visibility settings screen |
| `/ajustes/perfil` | Own profile |

---

## 9B. Specifics carried over from the published design

Reconciled from the Spec artifact (`docs/design-index.md`). Where these differ
from the rest of this document, these win — they are what the design actually
decided.

| Element | Spec |
| ------- | ---- |
| Button height | **48 px** actual, against a 44 px minimum touch target. All four variants. |
| Button states | normal · pressed · disabled. **No hover state exists**, in any variant. |
| Text inputs | 16 px minimum so Safari does not zoom on focus. |
| Date input | Native iOS picker, displayed `d/m/aaaa` in `es-CO`. |
| Money input | Dot grouping, no decimals, numeric keypad. |
| Transaction rows | The kind carries a glyph **and** a word: `↑ Ingreso`, `↓ Gasto`, `● Deuda`, `◆ Ahorro`. Colour is the third signal, never the first. |
| Debt rows | Show installment progress inline in the list — `2 sep · 14 de 36` — not only inside the expanded card. **Plan 5 task 10 puts `InstallmentSummary` in `DebtCard` only; the list row needs it too.** |
| Error state | Two actions, not one: **Reintentar** and **Ver sin conexión**. |
| Empty state | One sentence plus the action that fills it — e.g. "Todavía no hay movimientos en septiembre." / "Registrar el primero". |

### Visibility levels, in the design's own words

Use this copy on the settings screen and the badges:

- **Privado** — nadie más lo ve.
- **Resumen** — los demás ven que existe y su efecto en el total, no el detalle.
- **Público** — lo ve toda la familia.

---

## 10. States

Every list and card must define four states, and the empty state is the one
that gets skipped:

1. **Loading** — skeletons matching final layout dimensions, so nothing shifts.
2. **Empty** — an icon, one sentence of Spanish, and the action that fills it.
   A new household is entirely empty screens; they are the first impression.
3. **Error** — what failed and a retry. Never a raw error `type` slug.
4. **Populated**.

**Every mutation is optimistic with rollback on failure**, and a toast on
error. Financial entry happens in short bursts standing in a kitchen; waiting
on a spinner per transaction is how an app stops being used.

---

## 11. Accessibility

- WCAG 2.1 AA contrast in both color schemes.
- Every input has a real `<label>`. Placeholders are never labels.
- Focus is always visible: `:focus-visible` with a 2 px `--brand` ring.
- Sheets and modals trap focus and close on `Escape`.
- Live regions announce toasts.
- `prefers-reduced-motion` disables transitions.
- Icon-only buttons carry `aria-label` in Spanish.
- The page language is `<html lang="es-CO">`.

---

## 12. PWA

- `manifest.webmanifest`: name "Family Hub", `display: standalone`,
  `theme_color` `#0F766E`, 192/512 px icons plus a maskable icon.
- `apple-touch-icon` and `apple-mobile-web-app-status-bar-style` — iOS ignores
  parts of the manifest and reads these meta tags instead.
- Service worker caches the app shell; API responses are **never** cached to
  disk. A cached financial response is a copy of private data sitting in
  browser storage after a member's visibility setting has changed.
- An "Add to Home Screen" prompt appears once, dismissible. Phase 3 needs it
  installed for Web Push, so the habit is worth establishing early.
