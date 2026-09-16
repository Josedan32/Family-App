import Link from "next/link";

import type { Assignment } from "@/components/chores/AssignmentRow";
import { EffortBalanceBar, type BalanceRow } from "@/components/chores/EffortBalanceBar";
import { Card } from "@/components/ui/Card";
import { IconClock, IconSettings } from "@/components/ui/Icons";
import { ApiError } from "@/lib/api/errors";
import { pageFetch } from "@/lib/api/server";

import { GenerateCycleButton } from "./GenerateCycleButton";
import { TareasClient } from "./TareasClient";

interface Cycle {
  id: string;
  starts_on: string;
  ends_on: string;
  /** Drives the wheel, so every member replays the identical spin. */
  seed: number;
  assignments: Assignment[];
}

interface EffortBalances {
  window_days: number;
  window_start: string;
  members: BalanceRow[];
}

interface HouseholdDetail {
  my_role: string;
  my_member_id: string;
  members: { id: string; display_name: string; role: string }[];
}

async function fetchCurrentCycle(): Promise<Cycle | null> {
  try {
    return await pageFetch<Cycle>("/chore-cycles/current");
  } catch (error) {
    if (error instanceof ApiError && error.type === "not_found") return null;
    throw error;
  }
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatDay(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day} ${MONTHS[Number(month) - 1]}`;
}

export default async function TareasPage() {
  // FR-M8-15: chores carry no visibility rules at all, so nothing here is
  // wrapped in PrivateBlock — everyone in the household sees the same data.
  const [cycle, balances, household] = await Promise.all([
    fetchCurrentCycle(),
    pageFetch<EffortBalances>("/effort-balances"),
    pageFetch<HouseholdDetail>("/households/current"),
  ]);
  const isAdmin = household.my_role === "admin";
  // Guests are never assigned chores (FR-M8-06), so they are never a
  // reassignment target either.
  const assignableMembers = household.members.filter((m) => m.role !== "guest");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-[1.75rem] font-bold tracking-tight">Tareas</h1>
        {cycle ? (
          <span className="whitespace-nowrap text-xs text-text-muted">
            {formatDay(cycle.starts_on)} – {formatDay(cycle.ends_on)}
          </span>
        ) : null}
      </div>

      {isAdmin ? (
        <Link href="/tareas/admin">
          <Card className="flex items-center gap-3">
            <span aria-hidden="true" className="flex-none text-brand">
              <IconSettings />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Administrar tareas</p>
              <p className="text-xs text-text-muted">Catálogo y puntos de esfuerzo</p>
            </div>
          </Card>
        </Link>
      ) : null}

      <Link href="/ajustes/ausencias">
        <Card className="flex items-center gap-3">
          <span aria-hidden="true" className="flex-none text-brand">
            <IconClock />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Marcar ausencia</p>
            <p className="text-xs text-text-muted">
              Mientras estés ausente no se te asignan tareas
            </p>
          </div>
        </Card>
      </Link>

      {cycle ? (
        <>
          <EffortBalanceBar rows={balances.members} />
          <TareasClient
            cycle={cycle}
            members={assignableMembers}
            myMemberId={household.my_member_id}
          />
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="text-4xl text-text-muted" aria-hidden="true">
            <IconClock />
          </span>
          <p className="text-lg font-bold">No hay un ciclo activo</p>
          <p className="max-w-xs text-sm text-text-muted">
            {isAdmin
              ? "Sin ciclo no se reparten tareas ni se acumulan puntos de esfuerzo. El administrador del hogar abre el siguiente."
              : "Sin ciclo no se reparten tareas ni se acumulan puntos de esfuerzo. Cuando el administrador abra el siguiente, aparecerá aquí."}
          </p>
          {isAdmin ? <GenerateCycleButton /> : null}
        </div>
      )}
    </div>
  );
}
