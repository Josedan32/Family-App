"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AssignmentRow, type Assignment } from "@/components/chores/AssignmentRow";
import { clientFetch } from "@/lib/api/client";

interface Cycle {
  id: string;
  starts_on: string;
  ends_on: string;
  assignments: Assignment[];
}

export function TareasClient({ cycle }: { cycle: Cycle }) {
  const [assignments, setAssignments] = useState(cycle.assignments);
  const [showDone, setShowDone] = useState(false);
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: ["effort-balances"] });
    },
  });

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Esta semana
          </h2>
          <span className="whitespace-nowrap text-xs tabular-nums text-text-muted">
            {pending.length} pendientes · {pendingPoints} pts
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {pending.map((assignment) => (
            <AssignmentRow
              key={assignment.id}
              assignment={assignment}
              onComplete={(id) => complete.mutate(id)}
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
