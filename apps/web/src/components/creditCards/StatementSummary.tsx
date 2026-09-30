import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { IconLock } from "@/components/ui/Icons";
import { daysBetween, formatDateRange, formatDayMonthYear } from "@/lib/dates";
import type { CreditCardStatement } from "@/lib/creditCards";

const LINES: { sign: string; label: string; key: keyof CreditCardStatement }[] = [
  { sign: "", label: "Saldo anterior", key: "opening_balance_minor" },
  { sign: "+", label: "Compras", key: "purchases_total_minor" },
  { sign: "+", label: "Cuotas del mes", key: "installments_due_minor" },
  { sign: "+", label: "Interés cobrado", key: "interest_charged_minor" },
  { sign: "−", label: "Pagos", key: "payments_total_minor" },
];

/** The statement as a receipt. Every figure is the server's; nothing is summed here. */
export function StatementSummary({
  statement,
  currency,
  today,
}: {
  statement: CreditCardStatement;
  currency: string;
  today?: string;
}) {
  const range = formatDateRange(statement.cycle_starts_on, statement.cycle_ends_on);
  const past = today ? daysBetween(today, statement.payment_due_on) < 0 : false;
  return (
    <div
      role="group"
      aria-label={`Extracto ${range}`}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-sunken p-4"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-text-muted">
            Extracto más reciente
          </span>
          <span className="tabular text-[0.9375rem] font-bold">{range}</span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[0.6875rem] font-bold text-text-muted">
          <IconLock width={11} height={11} />
          Cerrado
        </span>
      </div>

      <dl className="tabular grid grid-cols-[1rem_1fr_auto] gap-x-1 gap-y-1 text-sm">
        {LINES.map(({ sign, label, key }) => (
          <div key={label} className="contents">
            <span className="text-text-muted">{sign}</span>
            <dt className="text-text-muted">{label}</dt>
            <dd>
              <MoneyDisplay amountMinor={statement[key] as number} currency={currency} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex items-baseline gap-2 border-t-[1.5px] border-dashed border-border pt-2.5">
        <span className="flex-1 text-sm font-semibold">Saldo del extracto</span>
        <MoneyDisplay
          amountMinor={statement.closing_balance_minor}
          currency={currency}
          className="text-2xl font-bold tracking-tight"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col rounded-xl border border-border bg-surface px-3 py-2">
          <span className="text-xs text-text-muted">Pago mínimo</span>
          <MoneyDisplay
            amountMinor={statement.minimum_payment_minor}
            currency={currency}
            className="font-bold"
          />
        </div>
        <div className="flex flex-col rounded-xl border border-border bg-surface px-3 py-2">
          <span className="text-xs text-text-muted">Fecha límite de pago</span>
          <span className={`tabular font-bold ${past ? "text-text-muted" : "text-warning"}`}>
            {formatDayMonthYear(statement.payment_due_on)}
          </span>
        </div>
      </div>

      <span className="text-xs text-text-muted">
        Cerrado el {formatDayMonthYear(statement.cycle_ends_on)}. No se edita ni se recalcula.
      </span>
    </div>
  );
}

/** One row of the statement history. Latest is tagged; older limit dates go grey. */
export function StatementListItem({
  statement,
  currency,
  today,
  latest,
}: {
  statement: CreditCardStatement;
  currency: string;
  today: string;
  latest?: boolean;
}) {
  const days = daysBetween(today, statement.payment_due_on);
  const dueText =
    days >= 0
      ? `${formatDayMonthYear(statement.payment_due_on)} · ${days === 0 ? "hoy" : `en ${days} ${days === 1 ? "día" : "días"}`}`
      : formatDayMonthYear(statement.payment_due_on);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-sunken px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="tabular flex-1 text-[0.9375rem] font-bold">
          {formatDateRange(statement.cycle_starts_on, statement.cycle_ends_on)}
        </span>
        {latest ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[0.6875rem] font-bold text-text-muted">
            <IconLock width={11} height={11} />
            Más reciente
          </span>
        ) : (
          <span className="text-text-muted">
            <IconLock width={13} height={13} />
          </span>
        )}
      </div>
      <MoneyDisplay
        amountMinor={statement.closing_balance_minor}
        currency={currency}
        className="text-xl font-bold tracking-tight"
      />
      <dl className="tabular grid grid-cols-[1fr_auto] gap-y-1 text-[0.8125rem]">
        <dt className="text-text-muted">Pago mínimo</dt>
        <dd><MoneyDisplay amountMinor={statement.minimum_payment_minor} currency={currency} /></dd>
        <dt className="text-text-muted">Interés cobrado</dt>
        <dd><MoneyDisplay amountMinor={statement.interest_charged_minor} currency={currency} /></dd>
        <dt className="text-text-muted">Fecha límite de pago</dt>
        <dd className={latest && days >= 0 ? "font-semibold text-warning" : "text-text-muted"}>{dueText}</dd>
      </dl>
    </div>
  );
}
