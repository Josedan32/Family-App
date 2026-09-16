"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AssignmentRow,
  type Assignment,
  type AssignmentMember,
} from "@/components/chores/AssignmentRow";
import { AssignmentWheel } from "@/components/chores/AssignmentWheel";
import { clientFetch } from "@/lib/api/client";

interface Cycle {
  id: string;
  starts_on: string;
  ends_on: string;
  seed: number;
  assignments: Assignment[];
}

/** A month-long cycle draws well over a hundred assignments; spinning for
 *  every one is unwatchable. The wheel reveals the week — the same span the
 *  page already calls "Esta semana", and the only one a family looks at. */
function thisWeek(assignments: Assignment[]): Assignment[] {
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 7);
  const from = today.toISOString().slice(0, 10);
  const to = horizon.toISOString().slice(0, 10);

  return assignments
    .filter((a) => a.due_on >= from && a.due_on <= to)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
}

export function TareasClient({
  cycle,
  members,
}: {
  cycle: Cycle;
  members: AssignmentMember[];
}) {
  const [assignments, setAssignments] = useState(cycle.assignments);
  const [showDone, setShowDone] = useState(false);
  const [showWheel, setShowWheel] = useState(false);
  const router = useRouter();

  const weekly = thisWeek(cycle.assignments);

  const pending = assignments.filter((a) => a.status === "pending");
  const done = assignments.filter((a) => a.status === "done");
  const pendingPoints = pending.reduce((sum, a) => sum + a.effort_points, 0);
  const donePoints = done.reduce((sum, a) => sum + a.effort_points, 0);

  const complete = useMutation({
    mutationFn: (id: string) =>
      clientFetch<Assignment>(`/chore-assignments/${id}/complete`, { method: "POST" }),
    onMutate: (id: string) => {
      const previous = assignments;
      setAssignments((current) =>
        current.map((a) => (a.id === id ? { ...a, status: "done" } : a)),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context) setAssignments(context.previous);
    },
    onSuccess: (updated) => {
      setAssignments((current) => current.map((a) => (a.id === updated.id ? updated : a)));
      // Completing an assignment moves the effort balance too.
      router.refresh();
    },
  });

  const reassign = useMutation({
    mutationFn: ({ id, memberId }: { id: string; memberId: string }) =>
      clientFetch<Assignment>(`/chore-assignments/${id}/reassign`, {
        method: "POST",
        body: JSON.stringify({ member_id: memberId }),
      }),
    onMutate: ({ id, memberId }) => {
      const previous = assignments;
      const newMember = members.find((m) => m.id === memberId);
      setAssignments((current) =>
        current.map((a) =>
          a.id === id
            ? { ...a, member_id: memberId, member_name: newMember?.display_name ?? a.member_name }
            : a,
        ),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context) setAssignments(context.previous);
    },
    onSuccess: (updated) => {
      setAssignments((current) => current.map((a) => (a.id === updated.id ? updated : a)));
    },
  });

  return (
    <>
      {showWheel && weekly.length > 0 ? (
        <AssignmentWheel
          key={`${cycle.id}-${cycle.seed}`}
          assignments={weekly}
          members={members}
          seed={cycle.seed}
        />
      ) : null}

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Esta semana
          </h2>
          {weekly.length > 0 && !showWheel ? (
            <button
              onClick={() => setShowWheel(true)}
              className="min-h-11 whitespace-nowrap px-1 text-xs font-semibold text-brand"
            >
              Ver el sorteo
            </button>
          ) : null}
          <span className="whitespace-nowrap text-xs tabular-nums text-text-muted">
            {pending.length} pendientes · {pendingPoints} pts
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {pending.map((assignment) => (
            <AssignmentRow
              key={assignment.id}
              assignment={assignment}
              members={members}
              onComplete={(id) => complete.mutate(id)}
              onReassign={(id, memberId) => reassign.mutate({ id, memberId })}
            />
          ))}
        </ul>
      </div>

      {done.length ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <button
            onClick={() => setShowDone((value) => !value)}
            aria-expanded={showDone}
            className="flex min-h-[52px] w-full items-center gap-2.5 px-3.5 text-left"
          >
            <span aria-hidden="true" className="text-xs text-text-muted">
              {showDone ? "▾" : "▸"}
            </span>
            <span className="flex-1 font-semibold text-text-muted">Hechas</span>
            <span className="whitespace-nowrap text-xs tabular-nums text-text-muted">
              {done.length} · {donePoints} pts
            </span>
          </button>
          {showDone ? (
            <ul className="flex flex-col gap-2 border-t border-border p-2">
              {done.map((assignment) => (
                <AssignmentRow key={assignment.id} assignment={assignment} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
