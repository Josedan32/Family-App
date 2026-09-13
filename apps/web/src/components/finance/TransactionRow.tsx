import { MoneyDisplay } from "./MoneyDisplay";

export interface Transaction {
  id: string;
  kind: "income" | "expense";
  category_id: string;
  category_name: string;
  amount_minor: number;
  currency: string;
  occurred_on: string;
  note: string | null;
  source: string;
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const isDerived = transaction.source !== "manual";

  return (
    <li
      className={`flex flex-col gap-2 rounded-2xl border border-border p-3.5 ${
        isDerived ? "bg-surface-sunken" : "bg-surface"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{transaction.category_name}</span>
            {isDerived ? (
              <span className="rounded-full border border-brand px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-brand">
                Aporte
              </span>
            ) : null}
          </div>
          {transaction.note ? (
            <span className="text-sm text-text-muted">{transaction.note}</span>
          ) : null}
          <span className="text-xs tracking-wide text-text-muted">
            {transaction.occurred_on}
          </span>
        </div>
        <MoneyDisplay
          amountMinor={transaction.amount_minor}
          currency={transaction.currency}
          kind={transaction.kind}
          className="whitespace-nowrap text-xl font-bold"
        />
      </div>
      {isDerived ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
          <span className="text-xs text-text-muted">
            Se registra automáticamente desde Aportes.
          </span>
          <a href="/aportes" className="whitespace-nowrap text-sm font-semibold text-brand">
            Ver aportes ›
          </a>
        </div>
      ) : null}
    </li>
  );
}
