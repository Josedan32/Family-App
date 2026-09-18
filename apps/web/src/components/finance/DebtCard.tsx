import { Card } from "@/components/ui/Card";
import { formatDayMonthYear } from "@/lib/dates";

import { standingLook, type Standing } from "./debtStanding";
import { InstallmentSummary } from "./InstallmentSummary";
import { MoneyDisplay } from "./MoneyDisplay";

export interface Debt {
  id: string;
  name: string;
  creditor_type: string;
  creditor_label: string;
  principal_minor: number;
  outstanding_minor: number;
  paid_total_minor: number;
  annual_interest_rate: number | null;
  due_day: number | null;
  status: string;
  currency: string;
  installments_total: number | null;
  installments_paid: number | null;
  installments_remaining: number | null;
  next_installment_on: string | null;
  next_installment_amount_minor: number | null;
  minimum_payment_minor: number | null;
  is_overdue: boolean | null;
  /** Derived by the API: see services/debt_standing.py. */
  standing: Standing;
  next_due_on: string | null;
  /** Share of the principal paid, as a ratio the API computed. */
  progress: number;
}

export function DebtStandingBadge({ standing }: { standing: string }) {
  const look = standingLook(standing);
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${look.pill}`}
    >
      {look.label}
    </span>
  );
}

export function DebtCard({ debt }: { debt: Debt }) {
  const look = standingLook(debt.standing);
  const paid = debt.standing === "paid";
  const percent = Math.min(Math.round(debt.progress * 100), 100);

  return (
    <Card
      className="flex flex-col gap-2.5 border-l-4"
      style={{ backgroundColor: look.tint, borderLeftColor: look.edge }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-bold">{debt.name}</span>
          {debt.creditor_label !== debt.name ? (
            <span className="truncate text-xs text-text-muted">{debt.creditor_label}</span>
          ) : null}
        </div>
        <DebtStandingBadge standing={debt.standing} />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs text-text-muted">{paid ? "Deuda saldada" : "Saldo pendiente"}</span>
          <MoneyDisplay
            amountMinor={paid ? debt.principal_minor : debt.outstanding_minor}
            currency={debt.currency}
            className={`whitespace-nowrap text-2xl font-bold ${paid ? "text-success" : "text-debt"}`}
          />
        </div>
        {debt.annual_interest_rate !== null ? (
          <span className="text-xs text-text-muted">{debt.annual_interest_rate}% E.A.</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <div
          role="progressbar"
          aria-label={`Abonado de ${debt.name}`}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
        >
          <div
            className={`h-full ${paid ? "bg-success" : "bg-debt"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-text-muted">
          <span>
            Abonado{" "}
            <MoneyDisplay amountMinor={debt.paid_total_minor} currency={debt.currency} className="text-xs" />
          </span>
          <span className="tabular">{percent}%</span>
        </div>
      </div>

      {!paid && debt.next_due_on ? (
        <span
          className={`text-xs font-semibold ${
            debt.standing === "overdue"
              ? "text-danger"
              : debt.standing === "due_soon"
                ? "text-warning"
                : "text-text-muted"
          }`}
        >
          Próximo pago: {formatDayMonthYear(debt.next_due_on)}
        </span>
      ) : null}

      {debt.installments_total !== null ? (
        <div className="border-t border-border pt-2">
          <InstallmentSummary
            installments_total={debt.installments_total}
            installments_paid={debt.installments_paid}
            installments_remaining={debt.installments_remaining}
            next_installment_on={debt.next_installment_on}
            next_installment_amount_minor={debt.next_installment_amount_minor}
            is_overdue={debt.is_overdue}
            currency={debt.currency}
          />
        </div>
      ) : null}
    </Card>
  );
}
