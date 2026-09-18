"use client";

import { DataTable } from "@/components/ui/DataTable";
import { formatDayMonthYear } from "@/lib/dates";

import { DebtStandingBadge, type Debt } from "./DebtCard";
import { standingLook } from "./debtStanding";
import type { Goal } from "./GoalCard";
import { HouseholdExpenseRow, type HouseholdExpense } from "./HouseholdExpenseRow";
import { MoneyDisplay } from "./MoneyDisplay";
import { PAYMENT_METHOD_LABEL } from "./TransactionForm";
import { transactionTitle, type Transaction } from "./TransactionRow";
import { derivedSource } from "./transactionSource";

/**
 * The "Tablas" alternative to each finance list. On a phone every table keeps
 * two columns — what it is and how much — and folds the rest into a line
 * under the name. A row opens the same detail page its card does.
 */

function methodLabel(method: string): string {
  return PAYMENT_METHOD_LABEL[method as keyof typeof PAYMENT_METHOD_LABEL] ?? method;
}

function categoryNames(transaction: Transaction): string {
  return transaction.categories.map((c) => c.name).join(" · ");
}

export function TransactionsTable({
  kind,
  transactions,
}: {
  kind: "income" | "expense";
  transactions: Transaction[];
}) {
  return (
    <DataTable
      caption={kind === "income" ? "Ingresos" : "Gastos"}
      rows={transactions}
      rowKey={(t) => t.id}
      rowHref={(t) => `/finanzas/movimientos/${t.id}`}
      rowClassName={(t) => (derivedSource(t.source) ? "bg-surface-sunken" : "")}
      mobileDetail={(t) => {
        const derived = derivedSource(t.source);
        return `${formatDayMonthYear(t.occurred_on)} · ${derived ? derived.pill : categoryNames(t)}`;
      }}
      columns={[
        { header: "Detalle", cell: (t) => transactionTitle(t) },
        {
          header: "Monto",
          align: "end",
          nowrap: true,
          cell: (t) => (
            <MoneyDisplay
              amountMinor={t.amount_minor}
              currency={t.currency}
              kind={t.kind}
              className="font-bold"
            />
          ),
        },
        {
          header: "Fecha",
          nowrap: true,
          hideOnMobile: true,
          cell: (t) => formatDayMonthYear(t.occurred_on),
        },
        {
          header: "Categoría",
          hideOnMobile: true,
          cell: (t) => {
            const derived = derivedSource(t.source);
            return (
              <span className="flex flex-wrap items-center gap-1.5">
                {categoryNames(t)}
                {derived && derived.pill !== t.categories[0]?.name ? (
                  <span className="whitespace-nowrap rounded-full border border-brand px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-brand">
                    {derived.pill}
                  </span>
                ) : null}
              </span>
            );
          },
        },
        { header: "Método", hideOnMobile: true, cell: (t) => methodLabel(t.payment_method) },
      ]}
    />
  );
}

const GOAL_STATE: Record<Goal["state"], string> = {
  en_progreso: "En progreso",
  completado: "Alcanzada",
  usada: "Usada",
};

function goalState(goal: Goal): string {
  return goal.is_overdue && goal.state === "en_progreso" ? "Plazo vencido" : GOAL_STATE[goal.state];
}

export function GoalsTable({ goals }: { goals: Goal[] }) {
  return (
    <DataTable
      caption="Ahorros"
      rows={goals}
      rowKey={(g) => g.id}
      rowHref={(g) => `/finanzas/ahorros/${g.id}`}
      rowClassName={(g) => (g.state === "usada" ? "text-text-muted" : "")}
      // A ratio the API reports: the table only rounds it.
      mobileDetail={(g) => `${Math.round(g.progress * 100)}% · ${goalState(g)}`}
      columns={[
        { header: "Meta", cell: (g) => g.name },
        {
          header: "Ahorrado",
          align: "end",
          nowrap: true,
          cell: (g) => (
            <MoneyDisplay
              amountMinor={g.balance_minor}
              currency={g.currency}
              className={`font-bold ${g.state === "usada" ? "" : "text-savings"}`}
            />
          ),
        },
        {
          header: "Progreso",
          align: "end",
          hideOnMobile: true,
          cell: (g) => `${Math.round(g.progress * 100)}%`,
        },
        {
          header: "Objetivo",
          align: "end",
          nowrap: true,
          hideOnMobile: true,
          cell: (g) => <MoneyDisplay amountMinor={g.target_amount_minor} currency={g.currency} />,
        },
        { header: "Estado", hideOnMobile: true, cell: goalState },
      ]}
    />
  );
}

export function DebtsTable({ debts }: { debts: Debt[] }) {
  return (
    <DataTable
      caption="Deudas"
      rows={debts}
      rowKey={(d) => d.id}
      rowHref={(d) => `/finanzas/deudas/${d.id}`}
      rowStyle={(d) => ({ backgroundColor: standingLook(d.standing).tint })}
      mobileDetail={(d) => (
        <>
          <span className="font-semibold">{standingLook(d.standing).label}</span>
          {d.standing !== "paid" && d.next_due_on
            ? ` · Próximo pago ${formatDayMonthYear(d.next_due_on)}`
            : ` · ${d.creditor_label}`}
        </>
      )}
      columns={[
        { header: "Deuda", cell: (d) => d.name },
        {
          header: "Pendiente",
          align: "end",
          nowrap: true,
          cell: (d) => (
            <MoneyDisplay
              amountMinor={d.outstanding_minor}
              currency={d.currency}
              className={`font-bold ${d.standing === "paid" ? "text-success" : "text-debt"}`}
            />
          ),
        },
        {
          header: "Estado",
          hideOnMobile: true,
          cell: (d) => <DebtStandingBadge standing={d.standing} />,
        },
        {
          header: "Próximo pago",
          nowrap: true,
          hideOnMobile: true,
          cell: (d) =>
            d.standing !== "paid" && d.next_due_on ? formatDayMonthYear(d.next_due_on) : "—",
        },
        {
          header: "Abonado",
          align: "end",
          nowrap: true,
          hideOnMobile: true,
          cell: (d) => <MoneyDisplay amountMinor={d.paid_total_minor} currency={d.currency} />,
        },
        { header: "Acreedor", hideOnMobile: true, cell: (d) => d.creditor_label },
      ]}
    />
  );
}

export function HouseholdExpensesTable({ expenses }: { expenses: HouseholdExpense[] }) {
  const payer = (e: HouseholdExpense) =>
    e.funding === "pot" ? "Del pozo" : `${e.paid_by_name ?? ""}${e.contribution_id ? " · aporte" : ""}`;

  return (
    <DataTable
      caption="Gastos del hogar"
      rows={expenses}
      rowKey={(e) => e.id}
      mobileDetail={(e) => `${formatDayMonthYear(e.occurred_on)} · ${payer(e)}`}
      columns={[
        { header: "Detalle", cell: (e) => e.name || e.category_name },
        {
          header: "Monto",
          align: "end",
          nowrap: true,
          cell: (e) => (
            <MoneyDisplay amountMinor={e.amount_minor} currency={e.currency} className="font-bold" />
          ),
        },
        {
          header: "Fecha",
          nowrap: true,
          hideOnMobile: true,
          cell: (e) => formatDayMonthYear(e.occurred_on),
        },
        { header: "Pagó", hideOnMobile: true, cell: payer },
        { header: "Categoría", hideOnMobile: true, cell: (e) => e.category_name },
      ]}
      renderExpanded={(e) => (
        <ul>
          <HouseholdExpenseRow expense={e} />
        </ul>
      )}
    />
  );
}
