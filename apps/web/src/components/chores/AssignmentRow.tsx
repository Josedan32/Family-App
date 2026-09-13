"use client";

import { useState } from "react";

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

export interface AssignmentMember {
  id: string;
  display_name: string;
}

export function AssignmentRow({
  assignment,
  members,
  onComplete,
  onReassign,
}: {
  assignment: Assignment;
  members?: AssignmentMember[];
  onComplete?: (id: string) => void;
  onReassign?: (assignmentId: string, newMemberId: string) => void;
}) {
  const done = assignment.status === "done";
  const [reassigning, setReassigning] = useState(false);
  const [target, setTarget] = useState(assignment.member_id);
  const canReassign = onReassign && (members?.length ?? 0) > 1;

  return (
    <li className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3.5">
      <div className="flex items-center gap-3">
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
      </div>

      {canReassign && !reassigning ? (
        <button
          onClick={() => setReassigning(true)}
          className="self-start text-xs font-semibold text-brand"
        >
          Reasignar
        </button>
      ) : null}

      {canReassign && reassigning ? (
        <div className="flex items-center gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="sr-only">Reasignar a</span>
            <select
              aria-label="Reasignar a"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm"
            >
              {members?.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.display_name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              setReassigning(false);
              if (target !== assignment.member_id) onReassign?.(assignment.id, target);
            }}
            className="min-h-11 flex-none rounded-xl bg-brand px-3.5 text-sm font-semibold text-brand-contrast active:bg-brand-pressed"
          >
            Confirmar
          </button>
        </div>
      ) : null}
    </li>
  );
}
