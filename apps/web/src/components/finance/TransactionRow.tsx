import Link from "next/link";

import { IconChevronRight } from "@/components/ui/Icons";
import { formatDayMonthYear } from "@/lib/dates";

import { MoneyDisplay } from "./MoneyDisplay";
import { derivedSource } from "./transactionSource";

export interface Transaction {
  id: string;
  kind: "income" | "expense";
  categories: { id: string; name: string }[];
  amount_minor: number;
  currency: string;
  occurred_on: string;
  name: string | null;
  note: string | null;
  source: string;
  is_recurring: boolean;
  frequency: string | null;
  payment_method: string;
}

export function transactionTitle(transaction: Transaction): string {
  return transaction.name || transaction.categories.map((c) => c.name).join(" · ");
}

/**
 * One line of the ledger: enough to recognize the movement at a glance. Its
 * detail, editing and deleting live on the movement's own page.
 */
export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const derived = derivedSource(transaction.source);

  return (
    <li>
      <Link
        href={`/finanzas/movimientos/${transaction.id}`}
        className={`flex items-center gap-3 rounded-2xl border border-border p-3.5 active:bg-surface-sunken md:hover:bg-surface-sunken ${
          derived ? "bg-surface-sunken" : "bg-surface"
        }`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-bold">{transactionTitle(transaction)}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-text-muted">
              {formatDayMonthYear(transaction.occurred_on)}
            </span>
            {transaction.name
              ? transaction.categories.map((category) => (
                  <span
                    key={category.id}
                    className="rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-text-muted"
                  >
                    {category.name}
                  </span>
                ))
              : null}
            {derived ? (
              <span className="rounded-full border border-brand px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-brand">
                {derived.pill}
              </span>
            ) : null}
          </div>
        </div>
        <MoneyDisplay
          amountMinor={transaction.amount_minor}
          currency={transaction.currency}
          kind={transaction.kind}
          className="whitespace-nowrap text-lg font-bold"
        />
        <span aria-hidden="true" className="flex-none text-text-muted">
          <IconChevronRight />
        </span>
      </Link>
    </li>
  );
}
