import { Card } from "@/components/ui/Card";
import { MoneyDisplay } from "./MoneyDisplay";

export interface Goal {
  id: string;
  name: string;
  target_amount_minor: number;
  balance_minor: number;
  progress: number;
  currency: string;
}

export function GoalCard({ goal }: { goal: Goal }) {
  // The API reports progress truthfully, including above 1. The bar caps.
  const percent = Math.round(goal.progress * 100);
  return (
    <Card className="flex flex-col gap-2.5">
      <span className="font-bold">{goal.name}</span>
      <div className="flex flex-wrap items-baseline gap-2">
        <MoneyDisplay
          amountMinor={goal.balance_minor}
          currency={goal.currency}
          className="text-[1.75rem] font-bold text-savings"
        />
        <span className="text-sm text-text-muted">
          de <MoneyDisplay amountMinor={goal.target_amount_minor} currency={goal.currency} className="text-sm" />
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progreso de ${goal.name}`}
        className="h-2 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className="h-full bg-savings" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <span className="text-xs font-semibold tabular text-text-muted">{percent}% de la meta</span>
    </Card>
  );
}
