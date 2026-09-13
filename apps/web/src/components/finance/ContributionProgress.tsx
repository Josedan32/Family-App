import { Card } from "@/components/ui/Card";
import { MoneyDisplay } from "./MoneyDisplay";

export function ContributionProgress({
  goalMinor,
  collectedMinor,
  progress,
  currency,
}: {
  goalMinor: number;
  collectedMinor: number;
  progress: number;
  currency: string;
}) {
  const percent = Math.round(progress * 100);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-text-muted">Aporte del hogar</span>
        <span className="text-sm font-semibold tabular text-brand">{percent}%</span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <MoneyDisplay
          amountMinor={collectedMinor}
          currency={currency}
          className="text-[2rem] font-bold"
        />
        <span className="text-sm text-text-muted">
          recaudado de{" "}
          <MoneyDisplay amountMinor={goalMinor} currency={currency} className="text-sm" />
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Aporte del hogar"
        className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className="h-full bg-brand" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
    </Card>
  );
}
