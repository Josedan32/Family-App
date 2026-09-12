import { ContributionProgress } from "@/components/finance/ContributionProgress";
import { MemberCard, type DashboardMember } from "@/components/finance/MemberCard";
import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { Card } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api/server";

interface Dashboard {
  period: string;
  currency: string;
  household: { income_minor: number; expenses_minor: number; savings_minor: number };
  contribution?: {
    goal_amount_minor: number;
    collected_minor: number;
    progress: number;
  };
  /** Always present — the API's DashboardResponse.pot is not optional. */
  pot: { collected_minor: number; spent_minor: number; balance_minor: number };
  members: DashboardMember[];
}

const HOUSEHOLD_TOTALS = [
  { key: "income_minor", label: "↑ Ingresos", color: "text-income" },
  { key: "expenses_minor", label: "↓ Gastos", color: "text-expense" },
  { key: "savings_minor", label: "◆ Ahorros", color: "text-savings" },
] as const;

export default async function DashboardPage() {
  // Server Component: figures the viewer may not see never reach the browser.
  const data = await apiFetch<Dashboard>("/dashboard");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-[2rem] font-bold tracking-tight">Inicio</h1>
        <span className="text-xs text-text-muted">{data.period}</span>
      </div>

      <Card>
        <p className="mb-3.5 text-sm font-medium text-text-muted">Totales del hogar</p>
        <div className="grid grid-cols-3 gap-3">
          {HOUSEHOLD_TOTALS.map(({ key, label, color }) => (
            <div key={key} className="flex min-w-0 flex-col gap-1">
              <span className={`text-xs font-medium ${color}`}>{label}</span>
              <MoneyDisplay
                amountMinor={data.household[key]}
                currency={data.currency}
                className="text-[1.0625rem] font-bold"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Spec §8.4: the totals above include every member, private ones
          included. Saying so here is what makes the derivability acceptable. */}
      <p className="-mt-2 text-xs text-text-muted">
        Los totales del hogar incluyen a todos los miembros.
      </p>

      {data.contribution ? (
        <ContributionProgress
          goalMinor={data.contribution.goal_amount_minor}
          collectedMinor={data.contribution.collected_minor}
          progress={data.contribution.progress}
          currency={data.currency}
        />
      ) : null}

      {/* Not a link yet: Plan 5's household ledger (/hogar/gastos) hasn't
          been built in this web app, so this stays informational until it is. */}
      <Card className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold tabular">
          Pozo: <MoneyDisplay amountMinor={data.pot.balance_minor} currency={data.currency} />
        </span>
        <span className="flex-none text-sm text-text-muted">Libro del hogar</span>
      </Card>

      <section className="mt-1 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold">Miembros</h2>
          <span className="text-xs text-text-muted">{data.members.length} personas</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.members.map((member) => (
            <MemberCard key={member.member_id} member={member} currency={data.currency} />
          ))}
        </div>
      </section>
    </div>
  );
}
