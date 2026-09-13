export interface Assignment {
  id: string;
  chore_id: string;
  chore_name: string;
  member_id: string;
  member_name: string;
  due_on: string;
  status: string;
  effort_points: number;
  completed_at: string | null;
  completed_by_member_id: string | null;
}

const STATUS: Record<string, string> = {
  pending: "Pendiente",
  done: "Hecha",
  skipped: "Omitida",
  reassigned: "Reasignada",
};

function formatDue(dueOn: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (dueOn === today) return "hoy";
  const [, month, day] = dueOn.split("-");
  const MONTHS = [
    "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  return `${day} ${MONTHS[Number(month) - 1]}`;
}

export function AssignmentRow({
  assignment,
  onComplete,
}: {
  assignment: Assignment;
  onComplete?: (id: string) => void;
}) {
  const done = assignment.status === "done";

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`font-bold ${done ? "text-text-muted line-through" : ""}`}>
          {assignment.chore_name}
        </span>
        <span className="text-xs text-text-muted">
          <span>{assignment.member_name}</span> · <span>{formatDue(assignment.due_on)}</span>
        </span>
      </div>
      <div className="flex flex-none flex-col items-end gap-0.5">
        <span
          className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums ${
            done
              ? "border-border bg-surface-sunken text-text-muted"
              : "border-brand bg-brand-tint text-brand"
          }`}
        >
          {assignment.effort_points} {assignment.effort_points === 1 ? "pt" : "pts"}
        </span>
        <span className="text-xs text-text-muted">
          {STATUS[assignment.status] ?? assignment.status}
        </span>
      </div>
      {assignment.status === "pending" && onComplete ? (
        <button
          onClick={() => onComplete(assignment.id)}
          aria-label={`Marcar ${assignment.chore_name} como hecha`}
          className="min-h-11 flex-none rounded-xl bg-brand px-3.5 text-sm font-semibold text-brand-contrast active:bg-brand-pressed"
        >
          Hecha
        </button>
      ) : null}
    </li>
  );
}
