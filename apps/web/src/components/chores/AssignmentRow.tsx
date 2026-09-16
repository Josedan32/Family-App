"use client";

import { useState } from "react";

export interface Assignment {
  id: string;
  chore_id: string;
  chore_name: string;
  /** The catalogue (FR-M8-16), carried on the assignment so the checklist is
   *  there while you do the chore. */
  chore_activities: string[];
  chore_requirements: string[];
  chore_expectation: string | null;
  member_id: string;
  member_name: string;
  due_on: string;
  status: string;
  effort_points: number;
  completed_at: string | null;
  completed_by_member_id: string | null;
}

/**
 * Which steps you have ticked, per device.
 *
 * Deliberately not server state: nobody needs to audit which sub-steps were
 * done — the only fact that counts is whether the chore is finished, and that
 * already has a button. This is a working note while you scrub the bathroom.
 * Private-mode browsers throw on access, hence the try/catch on both sides.
 */
function readChecked(assignmentId: string): string[] {
  try {
    const raw = window.localStorage.getItem(`fh:checklist:${assignmentId}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeChecked(assignmentId: string, steps: string[]): void {
  try {
    window.localStorage.setItem(`fh:checklist:${assignmentId}`, JSON.stringify(steps));
  } catch {
    /* Private mode, or storage full. The checklist just stops remembering. */
  }
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

  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const hasDetail =
    assignment.chore_activities.length > 0 ||
    assignment.chore_requirements.length > 0 ||
    Boolean(assignment.chore_expectation);

  // Read on the click that opens the panel, never during render or on mount:
  // the server has no localStorage, so reading earlier would mismatch the
  // hydrated markup.
  function toggleDetail() {
    if (!open) setChecked(readChecked(assignment.id));
    setOpen(!open);
  }

  function toggleStep(step: string) {
    const next = checked.includes(step)
      ? checked.filter((s) => s !== step)
      : [...checked, step];
    setChecked(next);
    writeChecked(assignment.id, next);
  }

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

      {hasDetail ? (
        <button
          onClick={toggleDetail}
          aria-expanded={open}
          className="self-start text-xs font-semibold text-brand"
        >
          {open ? "Ocultar detalle" : "Ver detalle"}
        </button>
      ) : null}

      {open ? (
        <div className="flex flex-col gap-3 rounded-xl bg-surface-sunken p-3">
          {assignment.chore_requirements.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-text-muted">
                Necesitas
              </span>
              <span className="text-sm">
                {assignment.chore_requirements.join(" · ")}
              </span>
            </div>
          ) : null}

          {assignment.chore_activities.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-muted">Pasos</span>
              <ul className="flex flex-col gap-1.5">
                {assignment.chore_activities.map((step) => (
                  <li key={step}>
                    <label className="flex items-start gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={checked.includes(step)}
                        onChange={() => toggleStep(step)}
                        className="mt-0.5 h-5 w-5 flex-none accent-brand"
                      />
                      <span className={checked.includes(step) ? "text-text-muted line-through" : ""}>
                        {step}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {assignment.chore_expectation ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-text-muted">
                Se considera hecha cuando
              </span>
              <span className="text-sm">{assignment.chore_expectation}</span>
            </div>
          ) : null}
        </div>
      ) : null}

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
