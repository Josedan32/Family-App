"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { GoalCard, type Goal } from "@/components/finance/GoalCard";
import { GoalsTable } from "@/components/finance/tables";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChipChoice } from "@/components/ui/filters";
import { IconDiamondFilled } from "@/components/ui/Icons";
import { clientFetch } from "@/lib/api/client";
import { filterGoals, type GoalStateFilter } from "@/lib/financeFilters";
import { useViewMode } from "@/lib/viewMode";

export function SavingsPanel({ onCreate }: { onCreate: () => void }) {
  const asTable = useViewMode() === "table";
  const [state, setState] = useState<GoalStateFilter>("all");
  const goals = useQuery({
    queryKey: ["savings-goals"],
    queryFn: () => clientFetch<Goal[]>("/me/savings-goals"),
  });

  if (goals.isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />;
  }

  const all = goals.data ?? [];
  if (!all.length) {
    return (
      <EmptyState
        icon={<IconDiamondFilled />}
        message="Crea una meta y sigue tu progreso hacia ella."
        action={<Button onClick={onCreate}>Crear una meta</Button>}
      />
    );
  }

  const count = (value: GoalStateFilter) => filterGoals(all, value).length;
  const visible = filterGoals(all, state);

  return (
    <div className="flex flex-col gap-3">
      <ChipChoice
        label="Estado de la meta"
        value={state}
        onChange={setState}
        options={[
          { value: "all", label: "Todas", count: all.length },
          { value: "en_progreso", label: "En progreso", count: count("en_progreso") },
          { value: "completado", label: "Alcanzadas", count: count("completado") },
          { value: "usada", label: "Usadas", count: count("usada") },
        ]}
      />

      {!visible.length ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-muted">
          No hay metas en este estado.
        </p>
      ) : asTable ? (
        <GoalsTable goals={visible} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((goal) => (
            <Link key={goal.id} href={`/finanzas/ahorros/${goal.id}`} className="block">
              <GoalCard goal={goal} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
