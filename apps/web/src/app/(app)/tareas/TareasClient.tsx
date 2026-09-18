"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  AssignmentRow,
  type Assignment,
  type AssignmentMember,
} from "@/components/chores/AssignmentRow";
import { AssignmentWheel } from "@/components/chores/AssignmentWheel";
import { ChoresTable } from "@/components/chores/ChoresTable";
import { clientFetch } from "@/lib/api/client";
import { useViewMode } from "@/lib/viewMode";

import { filterAssignments } from "./filterAssignments";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  done: "Hecha",
  skipped: "Omitida",
  reassigned: "Reasignada",
};

const STATUS_LABELS_PLURAL: Record<string, string> = {
  pending: "pendientes",
  done: "hechas",
  skipped: "omitidas",
  reassigned: "reasignadas",
};

interface Cycle {
  id: string;
  starts_on: string;
  ends_on: string;
  seed: number;
  seen: boolean;
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
  myMemberId,
  isAdmin = false,
}: {
  cycle: Cycle;
  members: AssignmentMember[];
  myMemberId: string;
  isAdmin?: boolean;
}) {
  const [assignments, setAssignments] = useState(cycle.assignments);
  const [showDone, setShowDone] = useState(false);
  const [showWheel, setShowWheel] = useState(false);
  const asTable = useViewMode() === "table";
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [minPoints, setMinPoints] = useState<number | null>(null);
  const [maxPoints, setMaxPoints] = useState<number | null>(null);
  // Admin-only: which household the list represents. Distinct from
  // `memberFilter` — that dropdown narrows to one member for anyone; this
  // is the admin's "am I looking at the whole household or just myself"
  // switch, and it must stay visually separate rather than double as the
  // same control (see task-12 brief).
  const [adminScope, setAdminScope] = useState<"all" | "mine">("all");
  const router = useRouter();

  const effectiveMemberFilter =
    isAdmin && adminScope === "mine" ? myMemberId : memberFilter;

  useEffect(() => {
    // Visiting this page is what "seeing the draw" means — no separate
    // button, and it never hides the card for anyone else's dashboard.
    if (!cycle.seen) {
      clientFetch(`/chore-cycles/${cycle.id}/seen`, { method: "POST" }).catch(() => {});
    }
  }, [cycle.id, cycle.seen]);

  const weeklyAll = thisWeek(cycle.assignments);

  const filtered = filterAssignments(assignments, {
    memberFilter: effectiveMemberFilter,
    statusFilter,
    minPoints,
    maxPoints,
  });
  const pending = filtered.filter((a) => a.status === "pending");
  const done = filtered.filter((a) => a.status === "done");
  const pendingPoints = pending.reduce((sum, a) => sum + a.effort_points, 0);
  const donePoints = done.reduce((sum, a) => sum + a.effort_points, 0);
  // The list only ever shows "pending" and "done" sections, so a status
  // filter set to "skipped"/"reassigned" (or a member/points combo that only
  // matches those) would otherwise blank the page with no explanation.
  const otherStatusOnly = filtered.length > 0 && pending.length === 0 && done.length === 0;
  const otherStatusMessage =
    statusFilter !== "all"
      ? `No hay tareas ${STATUS_LABELS_PLURAL[statusFilter]} en este periodo.`
      : "No hay tareas que coincidan con estos filtros.";

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
      {showWheel && weeklyAll.length > 0 ? (
        <AssignmentWheel
          key={`${cycle.id}-${cycle.seed}`}
          assignments={weeklyAll}
          members={members}
          seed={cycle.seed}
        />
      ) : null}

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Esta semana
          </h2>
          {weeklyAll.length > 0 && !showWheel ? (
            <button
              onClick={() => setShowWheel(true)}
              className="min-h-11 whitespace-nowrap px-1 text-xs font-semibold text-brand"
            >
              Ver el sorteo
            </button>
          ) : null}
        </div>
        {isAdmin ? (
          <div
            role="tablist"
            aria-label="Alcance de la vista"
            className="flex gap-1 rounded-xl border border-border bg-surface-sunken p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={adminScope === "all"}
              onClick={() => setAdminScope("all")}
              className={`min-h-9 flex-1 rounded-lg text-xs font-semibold ${
                adminScope === "all" ? "bg-surface text-brand shadow-sm" : "text-text-muted"
              }`}
            >
              Todas las tareas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={adminScope === "mine"}
              onClick={() => setAdminScope("mine")}
              className={`min-h-9 flex-1 rounded-lg text-xs font-semibold ${
                adminScope === "mine" ? "bg-surface text-brand shadow-sm" : "text-text-muted"
              }`}
            >
              Mis tareas
            </button>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            Ver
            <select
              value={memberFilter}
              disabled={isAdmin && adminScope === "mine"}
              onChange={(event) => setMemberFilter(event.target.value)}
              className="min-h-9 rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-text disabled:opacity-50"
            >
              <option value="all">Todos</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === myMemberId ? "Mis tareas" : m.display_name}
                </option>
              ))}
            </select>
          </label>
          <span className="whitespace-nowrap text-xs tabular-nums text-text-muted">
            {pending.length} pendientes · {pendingPoints} pts
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            Estado
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="min-h-9 rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-text"
            >
              <option value="all">Todos</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            Puntos
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              placeholder="Mín"
              value={minPoints ?? ""}
              onChange={(event) =>
                setMinPoints(event.target.value === "" ? null : Number(event.target.value))
              }
              className="min-h-9 w-14 rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-text"
            />
            –
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              placeholder="Máx"
              value={maxPoints ?? ""}
              onChange={(event) =>
                setMaxPoints(event.target.value === "" ? null : Number(event.target.value))
              }
              className="min-h-9 w-14 rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-text"
            />
          </label>
        </div>
        {asTable ? (
          pending.length ? (
            <ChoresTable
              caption="Tareas pendientes"
              assignments={pending}
              members={members}
              onComplete={(id) => complete.mutate(id)}
              onReassign={(id, memberId) => reassign.mutate({ id, memberId })}
            />
          ) : null
        ) : (
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
        )}
        {otherStatusOnly ? (
          <p className="rounded-xl border border-border bg-surface-sunken p-3 text-center text-xs text-text-muted">
            {otherStatusMessage}
          </p>
        ) : null}
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
            asTable ? (
              <div className="border-t border-border p-2">
                <ChoresTable caption="Tareas hechas" assignments={done} />
              </div>
            ) : (
              <ul className="flex flex-col gap-2 border-t border-border p-2">
                {done.map((assignment) => (
                  <AssignmentRow key={assignment.id} assignment={assignment} />
                ))}
              </ul>
            )
          ) : null}
        </div>
      ) : null}
    </>
  );
}
