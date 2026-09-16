import { ContributionProgress } from "@/components/finance/ContributionProgress";
import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconCheck, IconHandshake } from "@/components/ui/Icons";
import { pageFetch } from "@/lib/api/server";
import { ApiError } from "@/lib/api/errors";

import { ContributeButton } from "./ContributeButton";
import { MyContributions } from "./MyContributions";

interface ContributionMember {
  member_id: string;
  display_name: string;
  pledged_minor: number;
  contributed_minor: number;
}

interface CurrentPeriod {
  /** Absent from the docs' example JSON but present on PeriodDetailResponse
   * — needed to POST a contribution against this period. */
  id: string;
  period_month: string;
  status: string;
  goal_amount_minor: number;
  collected_minor: number;
  progress: number;
  currency: string;
  members: ContributionMember[];
}

async function currentPeriod(): Promise<CurrentPeriod | null> {
  try {
    return await pageFetch<CurrentPeriod>("/contribution-periods/current");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export default async function AportesPage() {
  const period = await currentPeriod();

  if (!period) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[1.75rem] font-bold tracking-tight">Aportes</h1>
        <EmptyState icon={<IconHandshake />} message="No hay un periodo abierto" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[1.75rem] font-bold tracking-tight">Aportes</h1>
        <span className="rounded-full border border-brand px-2 py-1 text-xs font-bold uppercase tracking-wide text-brand">
          Visible para todos
        </span>
      </div>

      <ContributionProgress
        goalMinor={period.goal_amount_minor}
        collectedMinor={period.collected_minor}
        progress={period.progress}
        currency={period.currency}
      />

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold">Quién aportó</h2>
          <span className="text-xs text-text-muted">{period.members.length} miembros</span>
        </div>
        <Card className="flex flex-col divide-y divide-border p-0">
          {period.members.map((member) => {
            const complete = member.contributed_minor >= member.pledged_minor;
            const missing = member.pledged_minor - member.contributed_minor;
            return (
              <div key={member.member_id} className="flex items-center gap-3 p-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-bold">{member.display_name}</span>
                  {complete ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-income">
                      <IconCheck />
                      Completó su cuota
                    </span>
                  ) : member.pledged_minor > 0 ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-debt">
                      Le faltan{" "}
                      <MoneyDisplay
                        amountMinor={missing}
                        currency={period.currency}
                        className="text-xs"
                      />
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted">Sin cuota asignada</span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <MoneyDisplay
                    amountMinor={member.contributed_minor}
                    currency={period.currency}
                    className="text-base font-bold"
                  />
                  <span className="text-xs text-text-muted">
                    de{" "}
                    <MoneyDisplay
                      amountMinor={member.pledged_minor}
                      currency={period.currency}
                      className="text-xs"
                    />
                  </span>
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      <MyContributions periodId={period.id} />

      <ContributeButton periodId={period.id} currency={period.currency} />
    </div>
  );
}
