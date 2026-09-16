import { MoneyDisplay } from "./MoneyDisplay";

export interface HouseholdExpense {
  id: string;
  category_id: string;
  category_name: string;
  amount_minor: number;
  currency: string;
  occurred_on: string;
  name: string | null;
  note: string | null;
  funding: "pot" | "member";
  paid_by_member_id: string | null;
  paid_by_name: string | null;
  expense_transaction_id: string | null;
  contribution_id: string | null;
}

/** No visibility rules apply here (FR-M4-15) — never wrap this in PrivateBlock. */
export function HouseholdExpenseRow({ expense }: { expense: HouseholdExpense }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-bold">{expense.name || expense.category_name}</span>
        {expense.name ? (
          <span className="w-fit rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {expense.category_name}
          </span>
        ) : null}
        {expense.note ? (
          <span className="text-sm text-text-muted">{expense.note}</span>
        ) : null}
        <span className="text-xs tracking-wide text-text-muted">{expense.occurred_on}</span>
      </div>
      <div className="flex flex-none flex-col items-end gap-1.5">
        <MoneyDisplay
          amountMinor={expense.amount_minor}
          currency={expense.currency}
          className="whitespace-nowrap text-lg font-bold"
        />
        <span className="rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
          {expense.funding === "pot" ? "Del pozo" : `Pagó ${expense.paid_by_name}`}
        </span>
        {expense.contribution_id ? (
          <span className="rounded-full border border-brand bg-brand px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-contrast">
            Cuenta como aporte
          </span>
        ) : null}
      </div>
    </li>
  );
}
