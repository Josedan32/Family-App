"use client";

import { Avatar } from "@/components/ui/Avatar";
import { DataTable } from "@/components/ui/DataTable";

import {
  AssignmentRow,
  STATUS_LABEL,
  formatDue,
  type Assignment,
  type AssignmentMember,
} from "./AssignmentRow";

/**
 * The "Tablas" view of the chore list. On a phone: the chore, with who and
 * when underneath, its points and the "Hecha" button. Tapping the chore
 * unfolds its usual card, checklist and reassign included.
 */
export function ChoresTable({
  caption,
  assignments,
  members,
  onComplete,
  onReassign,
  today,
}: {
  caption: string;
  assignments: Assignment[];
  members?: AssignmentMember[];
  onComplete?: (id: string) => void;
  onReassign?: (assignmentId: string, newMemberId: string) => void;
  today?: string;
}) {
  return (
    <DataTable
      caption={caption}
      rows={assignments}
      rowKey={(a) => a.id}
      rowClassName={(a) => (a.status === "done" ? "text-text-muted" : "")}
      mobileDetail={(a) => `${a.member_name} · ${formatDue(a.due_on, today)}`}
      columns={[
        { header: "Tarea", cell: (a) => a.chore_name },
        {
          header: "Quién",
          hideOnMobile: true,
          cell: (a) => (
            <span className="flex items-center gap-2">
              <Avatar
                displayName={a.member_name}
                photoUrl={a.member_photo_url}
                seed={a.member_id}
                size="sm"
              />
              {a.member_name}
            </span>
          ),
        },
        { header: "Fecha", nowrap: true, hideOnMobile: true, cell: (a) => formatDue(a.due_on, today) },
        {
          header: "Puntos",
          align: "end",
          nowrap: true,
          cell: (a) => `${a.effort_points} ${a.effort_points === 1 ? "pt" : "pts"}`,
        },
        {
          header: "Estado",
          align: "end",
          nowrap: true,
          cell: (a) =>
            a.status === "pending" && onComplete ? (
              <button
                type="button"
                onClick={() => onComplete(a.id)}
                aria-label={`Marcar ${a.chore_name} como hecha`}
                className="min-h-9 rounded-lg bg-brand px-3 text-xs font-semibold text-brand-contrast active:bg-brand-pressed"
              >
                Hecha
              </button>
            ) : (
              <span className="text-xs text-text-muted">{STATUS_LABEL[a.status] ?? a.status}</span>
            ),
        },
      ]}
      renderExpanded={(a) => (
        <ul>
          <AssignmentRow
            assignment={a}
            members={members}
            onComplete={onComplete}
            onReassign={onReassign}
            today={today}
          />
        </ul>
      )}
    />
  );
}
