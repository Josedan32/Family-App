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
  target_date: string | null;
  days_remaining: number | null;
  is_overdue: boolean;
  state: "completado" | "en_progreso";
}

const PRIORITY_LABEL: Record<Goal["priority"], string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

/**
 * The stored `priority` is genuine user input (docs/glossary.md §2) and is
 * never overwritten here — only its DISPLAY drops to "Baja" once the goal
 * is done, because a finished goal competing for attention with active ones
 * would misrepresent reality (docs/prueba-end-to-end.md).
 */
function displayPriority(goal: Goal): { label: string; className: string } {
  if (goal.state === "completado") {
    return { label: "Baja", className: "bg-success/15 text-success" };
  }
  if (goal.is_overdue) {
    return { label: PRIORITY_LABEL[goal.priority], className: "bg-danger/15 text-danger" };
  }
  return { label: PRIORITY_LABEL[goal.priority], className: "bg-surface-sunken text-text-muted" };
}

function cardTint(goal: Goal): string {
  if (goal.state === "completado") return "color-mix(in srgb, var(--success) 8%, var(--surface))";
  if (goal.is_overdue) return "color-mix(in srgb, var(--danger) 8%, var(--surface))";
  return "var(--surface)";
}

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
  const priority = displayPriority(goal);
  return (
    <Card className="flex flex-col gap-2.5" style={{ backgroundColor: cardTint(goal) }}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold">{goal.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priority.className}`}>
          Prioridad {priority.label}
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
