import Link from "next/link";

import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconHandshake } from "@/components/ui/Icons";
import { pageFetch } from "@/lib/api/server";

interface Period {
  id: string;
  period_month: string;
  goal_amount_minor: number;
  status: string;
  currency: string;
}

function monthLabel(periodMonth: string): string {
  const date = new Date(`${periodMonth}T00:00:00`);
  const label = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function PeriodListPage() {
  const periods = await pageFetch<Period[]>("/contribution-periods");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader />
      <h1 className="text-[1.75rem] font-bold tracking-tight">Periodos</h1>

      {periods.length === 0 ? (
        <EmptyState icon={<IconHandshake />} message="Aún no hay periodos de aportes" />
      ) : (
        <Card className="flex flex-col divide-y divide-border p-0">
          {periods.map((period) => (
            <Link
              key={period.id}
              href={`/aportes/${period.id}`}
              className="flex items-center justify-between gap-3 p-3.5 active:bg-surface-sunken"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-bold">{monthLabel(period.period_month)}</span>
                <span className="text-xs text-text-muted">
                  {period.status === "open" ? "Abierto" : "Cerrado"}
                </span>
              </div>
              <MoneyDisplay
                amountMinor={period.goal_amount_minor}
                currency={period.currency}
                className="text-sm font-semibold"
              />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
