import Link from "next/link";

import type { CategoryAmount } from "@/components/finance/CategoryBreakdownList";
import { CategoryBreakdownList } from "@/components/finance/CategoryBreakdownList";
import { ContributionProgress } from "@/components/finance/ContributionProgress";
import { MemberCard, type DashboardMember } from "@/components/finance/MemberCard";
import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { Card } from "@/components/ui/Card";
import { IconArrowDown, IconArrowUp, IconClock, IconDiamondFilled } from "@/components/ui/Icons";
import { ApiError } from "@/lib/api/errors";
import { pageFetch } from "@/lib/api/server";

interface Dashboard {
  period: string;
  currency: string;
  household: {
    income_minor: number;
    expenses_minor: number;
    savings_minor: number;
    expenses_by_category: CategoryAmount[];
  };
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
  { key: "income_minor", label: "Ingresos", Icon: IconArrowUp, color: "text-income" },
  { key: "expenses_minor", label: "Gastos", Icon: IconArrowDown, color: "text-expense" },
  { key: "savings_minor", label: "Ahorros", Icon: IconDiamondFilled, color: "text-savings" },
] as const;

interface PendingCycle {
  starts_on: string;
  ends_on: string;
  seen: boolean;
}

async function pendingCycle(): Promise<PendingCycle | null> {
  try {
    const cycle = await pageFetch<PendingCycle>("/chore-cycles/current");
    return cycle.seen ? null : cycle;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export default async function DashboardPage() {
  // Server Component: figures the viewer may not see never reach the browser.
  const [data, cycle] = await Promise.all([
    pageFetch<Dashboard>("/dashboard"),
    pendingCycle(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-[2rem] font-bold tracking-tight">Inicio</h1>
        <span className="text-xs text-text-muted">{data.period}</span>
      </div>

      {cycle ? (
        <Link href="/tareas">
          <Card className="flex items-center gap-3">
            <span aria-hidden="true" className="flex-none text-brand">
              <IconClock />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Hay un sorteo nuevo</p>
              <p className="text-xs text-text-muted">Mira qué tareas te tocaron esta vez</p>
            </div>
          </Card>
        </Link>
      ) : null}

      <Card>
        <p className="mb-3.5 text-sm font-medium text-text-muted">Totales del hogar</p>
        <div className="grid grid-cols-3 gap-3">
          {HOUSEHOLD_TOTALS.map(({ key, label, Icon, color }) => (
            <div key={key} className="flex min-w-0 flex-col gap-1">
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
                <Icon />
                {label}
              </span>
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

      <Card>
        <p className="mb-3.5 text-sm font-medium text-text-muted">
          Gastos del hogar por categoría
        </p>
        <CategoryBreakdownList rows={data.household.expenses_by_category} currency={data.currency} />
      </Card>

      {/* This reflects the household ledger (libro del hogar), a different
          record than the sum of personal transactions behind "Gastos"
          above — the two totals are not expected to match. */}
      <p className="-mt-2 text-xs text-text-muted">
        Refleja el libro del hogar; puede no coincidir con el total de gastos de arriba.
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
            <Link key={member.member_id} href={`/hogar/miembros/${member.member_id}`}>
              <MemberCard member={member} currency={data.currency} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
