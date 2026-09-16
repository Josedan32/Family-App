"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { DebtCard, type Debt } from "@/components/finance/DebtCard";
import { GoalCard, type Goal } from "@/components/finance/GoalCard";
import { GoalDetail } from "@/components/finance/GoalDetail";
import { TransactionForm } from "@/components/finance/TransactionForm";
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

type TabId = "income" | "expense" | "savings" | "debts";

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

function SavingsGoalForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [target, setTarget] = useState(0);

  const create = useMutation({
    mutationFn: () =>
      clientFetch("/me/savings-goals", {
        method: "POST",
        body: JSON.stringify({ name, target_amount_minor: target }),
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
        create.mutate();
      }}
    >
      <Input label="Nombre" required value={name} onChange={(e) => setName(e.target.value)} />
      <MoneyInput
        label="Meta"
        value={target}
        onChange={setTarget}
        currency={CURRENCY}
        kind="savings"
        required
      />
      {create.isError ? (
        <p role="alert" className="text-sm text-danger">
          {(create.error as Error).message}
        </p>
      ) : null}
      <Button type="submit" disabled={create.isPending || !name || target <= 0}>
        {create.isPending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

function DebtForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [creditorLabel, setCreditorLabel] = useState("");
  const [principal, setPrincipal] = useState(0);
  const [dueDay, setDueDay] = useState("");

  const create = useMutation({
    mutationFn: () =>
      clientFetch("/me/debts", {
        method: "POST",
        body: JSON.stringify({
          creditor_type: "other",
          creditor_label: creditorLabel,
          principal_minor: principal,
          due_day: dueDay ? Number(dueDay) : null,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
      pushToast({ message: "Deuda registrada", type: "success" });
      onDone();
    },
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <Input
        label="Acreedor"
        required
        value={creditorLabel}
        onChange={(e) => setCreditorLabel(e.target.value)}
      />
      <MoneyInput
        label="Monto"
        value={principal}
        onChange={setPrincipal}
        currency={CURRENCY}
        kind="debt"
        required
      />
      <Input
        label="Día de corte (opcional)"
        type="number"
        min={1}
        max={31}
        value={dueDay}
        onChange={(e) => setDueDay(e.target.value)}
      />
      {create.isError ? (
        <p role="alert" className="text-sm text-danger">
          {(create.error as Error).message}
        </p>
      ) : null}
      <Button type="submit" disabled={create.isPending || !creditorLabel || principal <= 0}>
        {create.isPending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

export default function FinanzasPage() {
  const [tab, setTab] = useState<TabId>("expense");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const queryClient = useQueryClient();

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

  async function refreshAndClose() {
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    pushToast({
      message: tab === "income" ? "Ingreso registrado" : "Gasto registrado",
      type: "success",
    });
    closeSheet();
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
            {transactions.data?.length ? (
              <ul className="flex flex-col gap-2.5">
                {transactions.data.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} />
                ))}
              </ul>
            ) : transactions.isLoading ? null : (
              <EmptyState
                icon={<IconFileText />}
                message={copy.message}
                action={<Button onClick={() => setSheetOpen(true)}>{copy.action}</Button>}
              />
            )}
          </>
        )}

        {tab === "savings" && (
          <>
            {goals.data?.length ? (
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
                action={<Button onClick={() => setSheetOpen(true)}>{copy.action}</Button>}
              />
            )}
          </>
        )}

        {tab === "debts" && (
          <>
            {debts.data?.length ? (
              <div className="flex flex-col gap-2.5">
                {debts.data.map((debt) => (
                  <DebtCard key={debt.id} debt={debt} />
                ))}
              </div>
            ) : debts.isLoading ? null : (
              <EmptyState
                icon={<IconCircleFilled />}
                message={copy.message}
                action={<Button onClick={() => setSheetOpen(true)}>{copy.action}</Button>}
              />
            )}
          </>
        )}
      </div>

      {/* Floating above the tab bar; safe-area handled by the shell, not here. */}
      <button
        aria-label={copy.action}
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl text-brand-contrast shadow-lg active:bg-brand-pressed md:bottom-6"
      >
        <IconPlus />
      </button>

      <Sheet open={sheetOpen} onClose={closeSheet} title={copy.sheetTitle}>
        {tab === "income" || tab === "expense" ? (
          <TransactionForm kind={tab} currency={CURRENCY} onDone={refreshAndClose} />
        ) : tab === "savings" ? (
          <SavingsGoalForm onDone={closeSheet} />
        ) : (
          <DebtForm onDone={closeSheet} />
        )}
      </Sheet>
    </div>
  );
}
