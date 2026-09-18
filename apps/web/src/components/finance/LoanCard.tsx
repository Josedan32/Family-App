import { Card } from "@/components/ui/Card";
import { IconCheck, IconCircleFilled, IconClose, IconSquareFilled } from "@/components/ui/Icons";
import { MoneyDisplay } from "./MoneyDisplay";

export interface Loan {
  id: string;
  lender_member_id: string;
  lender_name: string;
  borrower_member_id: string;
  borrower_name: string;
  amount_minor: number;
  outstanding_minor: number;
  currency: string;
  lent_on: string;
  due_on: string | null;
  status: string;
  note: string | null;
  /** Three-valued to support a household member who is neither the lender
   * nor the borrower viewing this loan. */
  perspective: "lender" | "borrower" | "observer";
}

// Shape carries the state too, never color alone: filled circle, square,
// checkmark, cross.
const STATUS: Record<string, { label: string; Glyph: typeof IconCircleFilled; color: string }> = {
  pending: { label: "Pendiente", Glyph: IconCircleFilled, color: "text-debt" },
  partially_paid: { label: "Abonado", Glyph: IconSquareFilled, color: "text-savings" },
  paid: { label: "Pagado", Glyph: IconCheck, color: "text-income" },
  cancelled: { label: "Cancelado", Glyph: IconClose, color: "text-text-muted" },
};

export function LoanCard({ loan }: { loan: Loan }) {
  const heading =
    loan.perspective === "lender"
      ? `Presté a ${loan.borrower_name}`
      : loan.perspective === "borrower"
        ? `Me prestó ${loan.lender_name}`
        : `${loan.lender_name} → ${loan.borrower_name}`;

  const status = STATUS[loan.status] ?? {
    label: loan.status,
    Glyph: IconCircleFilled,
    color: "text-text-muted",
  };
  const cancelled = loan.status === "cancelled";
  const amountTone =
    loan.perspective === "observer"
      ? ""
      : loan.perspective === "lender"
        ? "text-income"
        : "text-debt";

  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className={`font-bold ${cancelled ? "text-text-muted" : ""}`}>{heading}</span>
        <span
          className={`inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-xs font-semibold ${status.color}`}
        >
          <status.Glyph />
          {status.label}
        </span>
      </div>
      <MoneyDisplay
        amountMinor={loan.outstanding_minor}
        currency={loan.currency}
        className={`whitespace-nowrap text-lg font-bold ${cancelled ? "text-text-muted line-through" : amountTone}`}
      />
    </Card>
  );
}
