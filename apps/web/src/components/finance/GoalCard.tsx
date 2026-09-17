import { Card } from "@/components/ui/Card";
import { IconAlertTriangle, IconCheckCircle } from "@/components/ui/Icons";
import { MoneyDisplay } from "./MoneyDisplay";

export interface Goal {
  id: string;
  name: string;
  target_amount_minor: number;
  balance_minor: number;
  progress: number;
  currency: string;
  priority: "alta" | "media" | "baja";
  days_remaining: number | null;
  is_overdue: boolean;
  state: "completado" | "en_progreso";
}

const PRIORITY_LABEL: Record<Goal["priority"], string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

function GoalDeadlineState({ goal }: { goal: Goal }) {
  // Precedence: goal achieved > deadline passed > "N days left".
  if (goal.state === "completado") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-success">
        <IconCheckCircle /> Meta alcanzada
      </span>
    );
  }
  if (goal.is_overdue) {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-danger">
        <IconAlertTriangle /> Plazo vencido
      </span>
    );
  }
  if (goal.days_remaining !== null) {
    return (
      <span className="text-xs text-text-muted">{goal.days_remaining} días restantes</span>
    );
  }
  return null;
}

export function GoalCard({ goal }: { goal: Goal }) {
  // The API reports progress truthfully, including above 1. The bar caps.
  const percent = Math.round(goal.progress * 100);
  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold">{goal.name}</span>
        <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-text-muted">
          Prioridad {PRIORITY_LABEL[goal.priority]}
        </span>
      </div>
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
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tabular text-text-muted">{percent}% de la meta</span>
        <GoalDeadlineState goal={goal} />
      </div>
    </Card>
  );
}
