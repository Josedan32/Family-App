import { MoneyDisplay } from "./MoneyDisplay";

interface Props {
  installments_total: number | null;
  installments_paid: number | null;
  installments_remaining: number | null;
  next_installment_on: string | null;
  next_installment_amount_minor: number | null;
  is_overdue: boolean | null;
  currency: string;
}

export function InstallmentSummary(props: Props) {
  // A debt without a plan is valid and renders nothing (FR-M2-19).
  if (props.installments_total === null) return null;

  const percent = Math.round(
    ((props.installments_paid ?? 0) / props.installments_total) * 100,
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">
          Cuota {props.installments_paid} de {props.installments_total}
        </span>
        {props.is_overdue ? (
          <span className="font-medium text-danger">En mora</span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Cuotas pagadas"
        className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className="h-full bg-debt" style={{ width: `${percent}%` }} />
      </div>
      {props.installments_remaining === 0 ? (
        <span className="text-xs text-success">Plan completado</span>
      ) : (
        <span className="text-xs text-text-muted">
          Próxima:{" "}
          <MoneyDisplay
            amountMinor={props.next_installment_amount_minor ?? 0}
            currency={props.currency}
          />{" "}
          · {props.next_installment_on}
        </span>
      )}
    </div>
  );
}
