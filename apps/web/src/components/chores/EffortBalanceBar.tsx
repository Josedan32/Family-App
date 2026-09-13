import { Card } from "@/components/ui/Card";

export interface BalanceRow {
  member_id: string;
  display_name: string;
  effort_points: number;
  completed_count: number;
  pending_count: number;
}

export function EffortBalanceBar({ rows }: { rows: BalanceRow[] }) {
  // Scale against the highest balance, not against 100: the number that
  // matters is the gap between people, not an absolute score.
  const highest = Math.max(1, ...rows.map((row) => row.effort_points));
  const total = rows.reduce((sum, row) => sum + row.effort_points, 0);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-bold">Esfuerzo del periodo</span>
        <span className="whitespace-nowrap text-xs text-text-muted">{total} pts en total</span>
      </div>
      <div className="flex flex-col gap-3.5">
        {rows.map((row) => (
          <div key={row.member_id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold">{row.display_name}</span>
              <span className="whitespace-nowrap text-base font-bold tabular-nums">
                {row.effort_points} pts
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={row.effort_points}
              aria-valuemin={0}
              aria-valuemax={highest}
              aria-label={`Esfuerzo de ${row.display_name}`}
              className="h-2.5 overflow-hidden rounded-full bg-surface-sunken"
            >
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${(row.effort_points / highest) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-text-muted">
              {row.completed_count} hechas · {row.pending_count} pendientes
            </span>
          </div>
        ))}
      </div>
      <span className="text-xs text-text-muted">
        Las barras se comparan con el más alto del periodo, no con un máximo fijo.
      </span>
    </Card>
  );
}
