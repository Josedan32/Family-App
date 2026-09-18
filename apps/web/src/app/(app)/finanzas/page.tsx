"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { DebtCard, type Debt } from "@/components/finance/DebtCard";
import { DebtDetail } from "@/components/finance/DebtDetail";
import { GoalCard, type Goal } from "@/components/finance/GoalCard";
import { GoalDetail } from "@/components/finance/GoalDetail";
import { MonthlySummaryCard } from "@/components/finance/MonthlySummaryCard";
import { DebtsTable, GoalsTable, TransactionsTable } from "@/components/finance/tables";
import { TransactionRow, type Transaction } from "@/components/finance/TransactionRow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  IconDiamondFilled,
  IconCircleFilled,
  IconFileText,
  IconHandshake,
  IconPlus,
} from "@/components/ui/Icons";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Sheet } from "@/components/ui/Sheet";
import { Tabs } from "@/components/ui/Tabs";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";
import { useViewMode } from "@/lib/viewMode";

type TabId = "income" | "expense" | "savings" | "debts";

function isTabId(value: string | null): value is TabId {
  return value === "income" || value === "expense" || value === "savings" || value === "debts";
}

const TABS: { id: TabId; label: string }[] = [
  { id: "income", label: "Ingresos" },
  { id: "expense", label: "Gastos" },
  { id: "savings", label: "Ahorros" },
  { id: "debts", label: "Deudas" },
];

const EMPTY_COPY: Record<TabId, { message: string; action: string; sheetTitle: string }> = {
  income: {
    message: "Anota lo que recibiste hoy y lo verás aquí con su fecha.",
    action: "Registrar un ingreso",
    sheetTitle: "Registrar ingreso",
  },
  expense: {
    message: "Anota lo que gastaste hoy y lo verás aquí con su fecha.",
    action: "Registrar un gasto",
    sheetTitle: "Registrar gasto",
  },
  savings: {
    message: "Crea una meta y sigue tu progreso hacia ella.",
    action: "Crear una meta",
    sheetTitle: "Nueva meta de ahorro",
  },
  debts: {
    message: "Registra lo que debes para llevar el saldo pendiente.",
    action: "Registrar una deuda",
    sheetTitle: "Nueva deuda",
  },
};

const CURRENCY = "COP";

const PRIORITY_OPTIONS: { value: "alta" | "media" | "baja"; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

function SavingsGoalForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [target, setTarget] = useState(0);
  const [targetTouched, setTargetTouched] = useState(false);
  const [targetDate, setTargetDate] = useState("");
  const [priority, setPriority] = useState<"alta" | "media" | "baja">("media");

  const nameError = nameTouched && !name ? "Ponle un nombre a la meta" : undefined;
  const targetError = targetTouched && target <= 0 ? "Ingresa un monto mayor a cero" : undefined;
  const canSubmit = !!name && target > 0;

  const create = useMutation({
    mutationFn: () =>
      clientFetch("/me/savings-goals", {
        method: "POST",
        body: JSON.stringify({
          name,
          target_amount_minor: target,
          target_date: targetDate || null,
          priority,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["savings-goals"] });
      pushToast({ message: "Meta creada", type: "success" });
      onDone();
    },
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setNameTouched(true);
        setTargetTouched(true);
        if (canSubmit) create.mutate();
      }}
    >
      <Input
        label="Nombre"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => setNameTouched(true)}
        error={nameError}
      />
      <MoneyInput
        label="Meta"
        value={target}
        onChange={setTarget}
        onBlur={() => setTargetTouched(true)}
        currency={CURRENCY}
        kind="savings"
        error={targetError}
        required
      />
      <Input
        label="Fecha meta (opcional)"
        type="date"
        value={targetDate}
        onChange={(e) => setTargetDate(e.target.value)}
        helperText="Para calcular los días restantes hasta la meta."
      />
      <div role="radiogroup" aria-label="Prioridad" className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Prioridad</span>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1">
          {PRIORITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={priority === option.value}
              onClick={() => setPriority(option.value)}
              className={`min-h-[44px] rounded-lg text-sm font-semibold ${
                priority === option.value ? "bg-brand text-brand-contrast" : "text-text-muted"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {create.isError ? (
        <p role="alert" className="text-sm text-danger">
          {(create.error as Error).message}
        </p>
      ) : null}
      <Button type="submit" disabled={create.isPending || !canSubmit}>
        {create.isPending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

export default function FinanzasPage() {
  return (
    <Suspense fallback={null}>
      <FinanzasContent />
    </Suspense>
  );
}

function FinanzasContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<TabId>(isTabId(initialTab) ? initialTab : "expense");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
  const asTable = useViewMode() === "table";

  const transactions = useQuery({
    queryKey: ["transactions", tab],
    // Paginated envelope (docs/api-contract.md §1: every list carries
    // next_cursor) — Phase 1 shows the first page only, no "load more" yet.
    queryFn: () =>
      clientFetch<{ items: Transaction[]; next_cursor: string | null }>(
        `/me/transactions?kind=${tab}`,
      ),
    enabled: tab === "income" || tab === "expense",
    select: (data) => data.items,
  });

  const goals = useQuery({
    queryKey: ["savings-goals"],
    queryFn: () => clientFetch<Goal[]>("/me/savings-goals"),
    enabled: tab === "savings",
  });

  const debts = useQuery({
    queryKey: ["debts"],
    queryFn: () => clientFetch<Debt[]>("/me/debts"),
    enabled: tab === "debts",
  });

  function closeSheet() {
    setSheetOpen(false);
  }

  /** Only "savings" still opens the sheet — income/expense/debts have grown
   * enough fields (especially debts, with its installment plan) that a
   * dedicated page reads better than a modal filling the screen. */
  function openCreateFlow() {
    if (tab === "income" || tab === "expense") {
      router.push(`/finanzas/nuevo?kind=${tab}`);
    } else if (tab === "debts") {
      router.push("/finanzas/deudas/nueva");
    } else {
      setSheetOpen(true);
    }
  }

  const copy = EMPTY_COPY[tab];
  const month = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(
    new Date(),
  );

  return (
    <div className="relative flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-[1.75rem] font-bold tracking-tight">Finanzas</h1>
        <span className="text-xs capitalize text-text-muted">{month}</span>
      </div>

      <MonthlySummaryCard endpoint="/me/monthly-summary" />

      <Tabs tabs={TABS} active={tab} onChange={(id) => setTab(id as TabId)} />

      <Link href="/finanzas/prestamos">
        <Card className="flex items-center gap-3">
          <span aria-hidden="true" className="flex-none text-brand">
            <IconHandshake />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Préstamos</p>
            <p className="text-xs text-text-muted">Lo que prestaste y lo que te prestaron</p>
          </div>
        </Card>
      </Link>

      <div role="tabpanel" className="flex flex-col gap-2.5">
        {(tab === "income" || tab === "expense") && (
          <>
            {transactions.data?.length && asTable ? (
              <TransactionsTable kind={tab} transactions={transactions.data} />
            ) : transactions.data?.length ? (
              <ul className="flex flex-col gap-2.5">
                {transactions.data.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} />
                ))}
              </ul>
            ) : transactions.isLoading ? null : (
              <EmptyState
                icon={<IconFileText />}
                message={copy.message}
                action={<Button onClick={() => openCreateFlow()}>{copy.action}</Button>}
              />
            )}
          </>
        )}

        {tab === "savings" && (
          <>
            {goals.data?.length && asTable ? (
              <GoalsTable goals={goals.data} />
            ) : goals.data?.length ? (
              <div className="flex flex-col gap-2.5">
                {goals.data.map((goal) => (
                  <div key={goal.id} className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id)
                      }
                      className="w-full text-left"
                    >
                      <GoalCard goal={goal} />
                    </button>
                    {expandedGoalId === goal.id ? <GoalDetail goal={goal} /> : null}
                  </div>
                ))}
              </div>
            ) : goals.isLoading ? null : (
              <EmptyState
                icon={<IconDiamondFilled />}
                message={copy.message}
                action={<Button onClick={() => openCreateFlow()}>{copy.action}</Button>}
              />
            )}
          </>
        )}

        {tab === "debts" && (
          <>
            {debts.data?.length && asTable ? (
              <DebtsTable debts={debts.data} />
            ) : debts.data?.length ? (
              <div className="flex flex-col gap-2.5">
                {debts.data.map((debt) => (
                  <div key={debt.id} className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDebtId(expandedDebtId === debt.id ? null : debt.id)
                      }
                      className="w-full text-left"
                    >
                      <DebtCard debt={debt} />
                    </button>
                    {expandedDebtId === debt.id ? (
                      <DebtDetail
                        debt={debt}
                        onDeleted={() => setExpandedDebtId(null)}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : debts.isLoading ? null : (
              <EmptyState
                icon={<IconCircleFilled />}
                message={copy.message}
                action={<Button onClick={() => openCreateFlow()}>{copy.action}</Button>}
              />
            )}
          </>
        )}
      </div>

      {/* Floating above the tab bar; safe-area handled by the shell, not here. */}
      <button
        aria-label={copy.action}
        onClick={() => openCreateFlow()}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl text-brand-contrast shadow-lg active:bg-brand-pressed md:bottom-6"
      >
        <IconPlus />
      </button>

      <Sheet open={sheetOpen} onClose={closeSheet} title={EMPTY_COPY.savings.sheetTitle}>
        <SavingsGoalForm onDone={closeSheet} />
      </Sheet>
    </div>
  );
}
