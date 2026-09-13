import { Card } from "@/components/ui/Card";
import { MoneyDisplay } from "./MoneyDisplay";

export interface Debt {
  id: string;
  creditor_type: string;
  creditor_label: string;
  principal_minor: number;
  outstanding_minor: number;
  due_day: number | null;
  status: string;
  currency: string;
}

export function DebtCard({ debt }: { debt: Debt }) {
  return (
    <Card className="flex flex-col gap-2">
      <span className="font-bold">{debt.creditor_label}</span>
      <div className="flex items-end justify-between gap-3">
        <span className="text-xs text-text-muted">
          {debt.due_day ? `Vence el día ${debt.due_day}` : "Sin fecha de corte"}
        </span>
        <MoneyDisplay
          amountMinor={debt.outstanding_minor}
          currency={debt.currency}
          className="whitespace-nowrap text-2xl font-bold text-debt"
        />
      </div>
      {debt.status === "paid" ? (
        <span className="text-xs font-semibold text-success">Pagada</span>
      ) : (
        <span className="text-xs tracking-wide text-text-muted">Saldo pendiente</span>
      )}
    </Card>
  );
}
