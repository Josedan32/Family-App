import { MoneyDisplay } from "./MoneyDisplay";

export interface CategoryAmount {
  category_name: string;
  amount_minor: number;
}

/** A simple list of rows with a proportional bar — no charting library. */
export function CategoryBreakdownList({
  rows,
  currency,
}: {
  rows: CategoryAmount[];
  currency: string;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-text-muted">Sin gastos en este periodo.</p>;
  }
  const max = Math.max(...rows.map((row) => row.amount_minor));

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.category_name} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{row.category_name}</span>
            <MoneyDisplay
              amountMinor={row.amount_minor}
              currency={currency}
              className="flex-none font-medium"
            />
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-expense"
              style={{ width: `${max > 0 ? (row.amount_minor / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
