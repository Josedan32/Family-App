import { MoneyDisplay } from "./MoneyDisplay";

export function PotBalanceCard({
  collectedMinor,
  spentMinor,
  balanceMinor,
  currency,
}: {
  collectedMinor: number;
  spentMinor: number;
  balanceMinor: number;
  currency: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-brand bg-surface p-4">
      <span className="text-sm font-semibold text-brand">Pozo del hogar</span>
      <MoneyDisplay
        amountMinor={balanceMinor}
        currency={currency}
        className="text-[2.75rem] font-bold leading-none tracking-tight"
      />
      <span className="mt-1 whitespace-nowrap text-xs text-text-muted">
        Recaudado <MoneyDisplay amountMinor={collectedMinor} currency={currency} className="text-xs" /> ·
        Gastado <MoneyDisplay amountMinor={spentMinor} currency={currency} className="text-xs" />
      </span>
    </div>
  );
}
