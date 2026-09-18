import { ContributionProgress } from "@/components/finance/ContributionProgress";
import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { IconCheck } from "@/components/ui/Icons";
import { pageFetch } from "@/lib/api/server";

import { ContributeButton } from "../ContributeButton";
import { ClosePeriodButton } from "./ClosePeriodButton";
import { EditPledgesButton } from "./EditPledgesButton";
import { pledgeStatus } from "./pledgeStatus";
import { ReopenPeriodButton } from "./ReopenPeriodButton";

interface ContributionMember {
  member_id: string;
  display_name: string;
  pledged_minor: number;
  contributed_minor: number;
  missing_minor: number;
}

interface PeriodDetail {
  id: string;
  period_month: string;
  status: string;
  goal_amount_minor: number;
  collected_minor: number;
  pledged_minor: number;
  progress: number;
  currency: string;
  members: ContributionMember[];
}

interface HouseholdDetail {
  my_role: string;
  members: { id: string; role: string }[];
}

function monthLabel(periodMonth: string): string {
  const date = new Date(`${periodMonth}T00:00:00`);
  const label = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function PeriodDetailPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  const [period, household] = await Promise.all([
    pageFetch<PeriodDetail>(`/contribution-periods/${periodId}`),
    pageFetch<HouseholdDetail>("/households/current"),
  ]);
  const isAdmin = household.my_role === "admin";
  const guests = new Set(
    household.members.filter((member) => member.role === "guest").map((member) => member.id),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[1.75rem] font-bold tracking-tight">
          {monthLabel(period.period_month)}
        </h1>
        <span
          className={`rounded-full border px-2 py-1 text-xs font-bold uppercase tracking-wide ${
            period.status === "open" ? "border-brand text-brand" : "border-border text-text-muted"
          }`}
        >
          {period.status === "open" ? "Abierto" : "Cerrado"}
        </span>
      </div>

      <ContributionProgress
        goalMinor={period.goal_amount_minor}
        collectedMinor={period.collected_minor}
        progress={period.progress}
        currency={period.currency}
      />

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold">Quién aportó</h2>
            <span className="text-xs text-text-muted">
              Cuotas asignadas:{" "}
              <MoneyDisplay
                amountMinor={period.pledged_minor}
                currency={period.currency}
                className="text-xs"
              />
            </span>
          </div>
          {isAdmin && period.status === "open" ? (
            <EditPledgesButton
              periodId={period.id}
              currency={period.currency}
              members={period.members.filter((member) => !guests.has(member.member_id))}
            />
          ) : null}
        </div>
        <Card className="flex flex-col divide-y divide-border p-0">
          {period.members.map((member) => {
            const status = pledgeStatus(member.pledged_minor, member.contributed_minor);
            return (
              <div key={member.member_id} className="flex items-center gap-3 p-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-bold">{member.display_name}</span>
                  {status === "complete" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-income">
                      <IconCheck />
                      Completó su cuota
                    </span>
                  ) : status === "pending" ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-debt">
                      Le faltan{" "}
                      <MoneyDisplay
                        amountMinor={member.missing_minor}
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

      {period.status === "open" ? (
        <ContributeButton periodId={period.id} currency={period.currency} />
      ) : null}

      {period.status === "open" ? (
        <ClosePeriodButton periodId={period.id} isAdmin={isAdmin} status={period.status} />
      ) : (
        <ReopenPeriodButton periodId={period.id} isAdmin={isAdmin} status={period.status} />
      )}
    </div>
  );
}
