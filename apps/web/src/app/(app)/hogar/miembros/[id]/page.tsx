import { InstallmentLine } from "@/components/finance/InstallmentLine";
import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrivateBlock } from "@/components/privacy/PrivateBlock";
import { VisibilityBadge, type Level } from "@/components/privacy/VisibilityBadge";
import { Card } from "@/components/ui/Card";
import { IconArrowDown, IconArrowUp, IconCircleFilled, IconDiamondFilled } from "@/components/ui/Icons";
import { ApiError } from "@/lib/api/errors";
import { pageFetch } from "@/lib/api/server";

interface Member {
  id: string;
  display_name: string;
  relationship: string | null;
  photo_url: string | null;
  role: string;
  status: string;
  age: number | null;
}

interface HouseholdDetail {
  members: Member[];
}

interface MoneyTotal {
  period: string;
  total_minor: number;
  currency: string;
}

interface TransactionListItem {
  id: string;
  categories: { id: string; name: string }[];
  amount_minor: number;
  occurred_on: string;
  note: string | null;
}

interface TransactionList {
  items: TransactionListItem[];
  next_cursor: string | null;
}

interface SavingsSummary {
  total_balance_minor: number;
  currency: string;
}

interface SavingsGoal {
  id: string;
  name: string;
  balance_minor: number;
  currency: string;
}

interface DebtSummary {
  total_outstanding_minor: number;
  currency: string;
}

interface DebtItem {
  id: string;
  creditor_label: string;
  outstanding_minor: number;
  currency: string;
  installments_total: number | null;
  installments_paid: number | null;
  next_installment_on: string | null;
}

interface CurrentPeriod {
  currency: string;
  members: { member_id: string; contributed_minor: number }[];
}

async function moduleData<T>(path: string): Promise<T | null> {
  try {
    return await pageFetch<T>(path);
  } catch (error) {
    // A denial is expected and normal here — it is the privacy model working.
    if (error instanceof ApiError && error.type === "not_visible") return null;
    throw error;
  }
}

const GLYPH: Record<string, typeof IconArrowUp> = {
  Ingresos: IconArrowUp,
  Gastos: IconArrowDown,
  Ahorros: IconDiamondFilled,
  Deudas: IconCircleFilled,
};

type ModuleState = "private" | "summary" | "detail";

function SummaryOrDetail({
  name,
  label,
  color,
  state,
  renderSummary,
  renderDetail,
}: {
  name: string;
  label: string;
  color: string;
  state: ModuleState;
  renderSummary: () => React.ReactNode;
  renderDetail: () => React.ReactNode;
}) {
  const level: Level = state === "private" ? "private" : state === "summary" ? "summary" : "public";
  const Glyph = GLYPH[label];

  return (
    <Card className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <h2 className="flex flex-1 items-center gap-2 text-lg font-semibold">
          <span className={color}>
            <Glyph />
          </span>
          {label}
        </h2>
        <VisibilityBadge level={level} />
      </div>
      {state === "private" ? (
        <PrivateBlock member={name} />
      ) : state === "summary" ? (
        renderSummary()
      ) : (
        renderDetail()
      )}
    </Card>
  );
}

function moduleState(data: unknown, isSummary: (value: unknown) => boolean): ModuleState {
  if (data === null) return "private";
  return isSummary(data) ? "summary" : "detail";
}

const isMoneyTotal = (value: unknown): value is MoneyTotal =>
  typeof value === "object" && value !== null && "total_minor" in value;
const isSavingsSummary = (value: unknown): value is SavingsSummary =>
  typeof value === "object" && value !== null && "total_balance_minor" in value;
const isDebtSummary = (value: unknown): value is DebtSummary =>
  typeof value === "object" && value !== null && "total_outstanding_minor" in value;

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [household, income, expenses, savings, debts, period] = await Promise.all([
    pageFetch<HouseholdDetail>("/households/current"),
    moduleData<MoneyTotal | TransactionList>(`/members/${id}/income`),
    moduleData<MoneyTotal | TransactionList>(`/members/${id}/expenses`),
    moduleData<SavingsSummary | SavingsGoal[]>(`/members/${id}/savings`),
    moduleData<DebtSummary | DebtItem[]>(`/members/${id}/debts`),
    moduleData<CurrentPeriod>("/contribution-periods/current"),
  ]);

  const member = household.members.find((candidate) => candidate.id === id);
  const contribution = period?.members.find((row) => row.member_id === id);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader />
      <div className="flex items-center gap-3.5">
        <div
          aria-hidden="true"
          className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-brand text-xl font-bold text-brand-contrast"
        >
          {member?.display_name.charAt(0) ?? "?"}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{member?.display_name ?? "—"}</h1>
          <p className="text-sm text-text-muted">
            {member?.relationship}
            {member?.age !== null && member?.age !== undefined ? ` · ${member.age} años` : ""}
          </p>
        </div>
      </div>

      <SummaryOrDetail
        name={member?.display_name ?? ""}
        label="Ingresos"
        color="text-income"
        state={moduleState(income, isMoneyTotal)}
        renderSummary={() => {
          const total = income as MoneyTotal;
          return (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">Total del mes</span>
              <MoneyDisplay
                amountMinor={total.total_minor}
                currency={total.currency}
                className="text-[2.5rem] font-bold"
              />
            </div>
          );
        }}
        renderDetail={() => {
          const list = income as TransactionList;
          return (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">Total del mes</span>
              <MoneyDisplay
                amountMinor={list.items.reduce((sum, t) => sum + t.amount_minor, 0)}
                currency="COP"
                className="text-[2.5rem] font-bold"
              />
            </div>
          );
        }}
      />

      <SummaryOrDetail
        name={member?.display_name ?? ""}
        label="Gastos"
        color="text-expense"
        state={moduleState(expenses, isMoneyTotal)}
        renderSummary={() => {
          const total = expenses as MoneyTotal;
          return (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">Total del mes</span>
              <MoneyDisplay
                amountMinor={total.total_minor}
                currency={total.currency}
                className="text-[2.5rem] font-bold"
              />
            </div>
          );
        }}
        renderDetail={() => {
          const list = expenses as TransactionList;
          return (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">Total del mes</span>
              <MoneyDisplay
                amountMinor={list.items.reduce((sum, t) => sum + t.amount_minor, 0)}
                currency="COP"
                className="text-[2.5rem] font-bold"
              />
            </div>
          );
        }}
      />

      <SummaryOrDetail
        name={member?.display_name ?? ""}
        label="Ahorros"
        color="text-savings"
        state={moduleState(savings, isSavingsSummary)}
        renderSummary={() => {
          const total = savings as SavingsSummary;
          return (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">Total del mes</span>
              <MoneyDisplay
                amountMinor={total.total_balance_minor}
                currency={total.currency}
                className="text-[2.5rem] font-bold"
              />
            </div>
          );
        }}
        renderDetail={() => {
          const goals = savings as SavingsGoal[];
          return (
            <ul className="flex flex-col divide-y divide-border">
              {goals.map((goal) => (
                <li key={goal.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="font-semibold">{goal.name}</span>
                  <MoneyDisplay
                    amountMinor={goal.balance_minor}
                    currency={goal.currency}
                    className="font-semibold"
                  />
                </li>
              ))}
            </ul>
          );
        }}
      />

      <SummaryOrDetail
        name={member?.display_name ?? ""}
        label="Deudas"
        color="text-debt"
        state={moduleState(debts, isDebtSummary)}
        renderSummary={() => {
          const total = debts as DebtSummary;
          return (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">Total del mes</span>
              <MoneyDisplay
                amountMinor={total.total_outstanding_minor}
                currency={total.currency}
                className="text-[2.5rem] font-bold"
              />
            </div>
          );
        }}
        renderDetail={() => {
          const rows = debts as DebtItem[];
          return (
            <ul className="flex flex-col divide-y divide-border">
              {rows.map((debt) => (
                <li key={debt.id} className="flex flex-col gap-0.5 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{debt.creditor_label}</span>
                    <MoneyDisplay
                      amountMinor={debt.outstanding_minor}
                      currency={debt.currency}
                      className="font-semibold text-debt"
                    />
                  </div>
                  <InstallmentLine
                    installments_paid={debt.installments_paid}
                    installments_total={debt.installments_total}
                    next_installment_on={debt.next_installment_on}
                  />
                </li>
              ))}
            </ul>
          );
        }}
      />

      {contribution ? (
        <div className="flex items-baseline justify-between gap-3 rounded-2xl border border-border bg-surface-sunken px-4 py-3.5">
          <span className="text-[0.9375rem] font-medium">Aporte al hogar</span>
          <MoneyDisplay
            amountMinor={contribution.contributed_minor}
            currency={period!.currency}
            className="text-lg font-bold text-brand"
          />
        </div>
      ) : null}
    </div>
  );
}
