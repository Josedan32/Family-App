"use client";

import { DataTable } from "@/components/ui/DataTable";
import { formatDayMonthYear } from "@/lib/dates";

import type { Debt } from "./DebtCard";
import { DebtDetail } from "./DebtDetail";
import type { Goal } from "./GoalCard";
import { GoalDetail } from "./GoalDetail";
import { HouseholdExpenseRow, type HouseholdExpense } from "./HouseholdExpenseRow";
import { MoneyDisplay } from "./MoneyDisplay";
import { PAYMENT_METHOD_LABEL } from "./TransactionForm";
import { TransactionRow, type Transaction } from "./TransactionRow";
import { derivedSource } from "./transactionSource";

/** The "Tablas" alternative to each finance list. Every table opens the same
 *  card or detail its "Tarjetas" twin shows, so actions live in one place. */

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1.5 whitespace-nowrap rounded-full border border-brand px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-brand">
      {children}
    </span>
  );
}

function transactionTitle(transaction: Transaction): string {
  return transaction.name || transaction.categories.map((c) => c.name).join(" · ");
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
      columns={[
        { header: "Detalle", cell: (t) => transactionTitle(t) },
        {
          header: "Monto",
          align: "end",
          cell: (t) => (
            <MoneyDisplay
              amountMinor={t.amount_minor}
              currency={t.currency}
              kind={t.kind}
              className="whitespace-nowrap font-bold"
            />
          ),
        },
        { header: "Fecha", nowrap: true, cell: (t) => formatDayMonthYear(t.occurred_on) },
        {
          header: "Categoría",
          cell: (t) => {
            const derived = derivedSource(t.source);
            return (
              <>
                {t.categories.map((c) => c.name).join(" · ")}
                {derived && derived.pill !== t.categories[0]?.name ? (
                  <Pill>{derived.pill}</Pill>
                ) : null}
              </>
            );
          },
        },
        {
          header: "Método",
          cell: (t) =>
            PAYMENT_METHOD_LABEL[t.payment_method as keyof typeof PAYMENT_METHOD_LABEL] ??
            t.payment_method,
        },
      ]}
      renderExpanded={(t) => (
        <ul>
          <TransactionRow transaction={t} />
        </ul>
      )}
    />
  );
}

const GOAL_STATE: Record<Goal["state"], string> = {
  en_progreso: "En progreso",
  completado: "Alcanzada",
  usada: "Usada",
};

export function GoalsTable({ goals }: { goals: Goal[] }) {
  return (
    <DataTable
      caption="Ahorros"
      rows={goals}
      rowKey={(g) => g.id}
      rowClassName={(g) => (g.state === "usada" ? "text-text-muted" : "")}
      columns={[
        { header: "Meta", cell: (g) => g.name },
        {
          header: "Ahorrado",
          align: "end",
          cell: (g) => (
            <MoneyDisplay
              amountMinor={g.balance_minor}
              currency={g.currency}
              className={`whitespace-nowrap font-bold ${g.state === "usada" ? "" : "text-savings"}`}
            />
          ),
        },
        // A ratio, not money: the API reports it and the table only rounds it.
        { header: "Progreso", align: "end", cell: (g) => `${Math.round(g.progress * 100)}%` },
        {
          header: "Objetivo",
          align: "end",
          cell: (g) => (
            <MoneyDisplay amountMinor={g.target_amount_minor} currency={g.currency} className="whitespace-nowrap" />
          ),
        },
        {
          header: "Estado",
          cell: (g) => (g.is_overdue && g.state === "en_progreso" ? "Plazo vencido" : GOAL_STATE[g.state]),
        },
      ]}
      renderExpanded={(g) => <GoalDetail goal={g} />}
    />
  );
}

export function DebtsTable({ debts }: { debts: Debt[] }) {
  return (
    <DataTable
      caption="Deudas"
      rows={debts}
      rowKey={(d) => d.id}
      columns={[
        { header: "Deuda", cell: (d) => d.name },
        {
          header: "Pendiente",
          align: "end",
          cell: (d) => (
            <MoneyDisplay
              amountMinor={d.outstanding_minor}
              currency={d.currency}
              className="whitespace-nowrap font-bold text-debt"
            />
          ),
        },
        {
          header: "Abonado",
          align: "end",
          cell: (d) => (
            <MoneyDisplay amountMinor={d.paid_total_minor} currency={d.currency} className="whitespace-nowrap" />
          ),
        },
        { header: "Acreedor", cell: (d) => d.creditor_label },
        {
          header: "Corte",
          cell: (d) => (d.status === "paid" ? "Pagada" : d.due_day ? `Día ${d.due_day}` : "—"),
        },
      ]}
      renderExpanded={(d) => <DebtDetail debt={d} onDeleted={() => undefined} />}
    />
  );
}

export function HouseholdExpensesTable({ expenses }: { expenses: HouseholdExpense[] }) {
  return (
    <DataTable
      caption="Gastos del hogar"
      rows={expenses}
      rowKey={(e) => e.id}
      columns={[
        { header: "Detalle", cell: (e) => e.name || e.category_name },
        {
          header: "Monto",
          align: "end",
          cell: (e) => (
            <MoneyDisplay amountMinor={e.amount_minor} currency={e.currency} className="whitespace-nowrap font-bold" />
          ),
        },
        { header: "Fecha", nowrap: true, cell: (e) => formatDayMonthYear(e.occurred_on) },
        {
          header: "Pagó",
          cell: (e) =>
            e.funding === "pot"
              ? "Del pozo"
              : `${e.paid_by_name ?? ""}${e.contribution_id ? " · aporte" : ""}`,
        },
        { header: "Categoría", cell: (e) => e.category_name },
      ]}
      renderExpanded={(e) => (
        <ul>
          <HouseholdExpenseRow expense={e} />
        </ul>
      )}
    />
  );
}
