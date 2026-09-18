"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { MonthlySummaryCard } from "@/components/finance/MonthlySummaryCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconChevronRight, IconHandshake, IconPlus } from "@/components/ui/Icons";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { MonthStepper } from "@/components/ui/MonthStepper";
import { Sheet } from "@/components/ui/Sheet";
import { Tabs } from "@/components/ui/Tabs";
import { clientFetch } from "@/lib/api/client";
import { currentMonth, isMonth } from "@/lib/months";
import { pushToast } from "@/lib/toast";

import { DebtsPanel } from "./DebtsPanel";
import { SavingsPanel } from "./SavingsPanel";
import { TransactionsPanel } from "./TransactionsPanel";

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

const CREATE_LABEL: Record<TabId, string> = {
  income: "Registrar un ingreso",
  expense: "Registrar un gasto",
  savings: "Crear una meta",
  debts: "Registrar una deuda",
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
  const params = useSearchParams();
  // Tab and month live in the URL, so coming back from a movement's page
  // lands on the same tab and month.
  const tabParam = params.get("tab");
  const tab: TabId = isTabId(tabParam) ? tabParam : "expense";
  const monthParam = params.get("mes");
  const month = isMonth(monthParam) ? monthParam : currentMonth();
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);

  function navigate(next: { tab?: TabId; mes?: string }) {
    router.replace(`/finanzas?tab=${next.tab ?? tab}&mes=${next.mes ?? month}`, {
      scroll: false,
    });
  }

  /** Savings still opens a sheet — its form is short. The others have grown
   * enough fields that a page of their own reads better. */
  function openCreateFlow() {
    if (tab === "income" || tab === "expense") {
      router.push(`/finanzas/nuevo?kind=${tab}`);
    } else if (tab === "debts") {
      router.push("/finanzas/deudas/nueva");
    } else {
      setGoalSheetOpen(true);
    }
  }

  return (
    <div className="relative flex flex-col gap-4">
      <h1 className="text-[1.75rem] font-bold tracking-tight">Finanzas</h1>

      <MonthStepper value={month} onChange={(mes) => navigate({ mes })} />

      <MonthlySummaryCard endpoint="/me/monthly-summary" period={month} />

      <Tabs tabs={TABS} active={tab} onChange={(id) => navigate({ tab: id as TabId })} />

      <Link href="/finanzas/prestamos">
        <Card className="flex items-center gap-3 active:bg-surface-sunken">
          <span aria-hidden="true" className="flex-none text-brand">
            <IconHandshake />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Préstamos</p>
            <p className="text-xs text-text-muted">Lo que prestaste y lo que te prestaron</p>
          </div>
          <span aria-hidden="true" className="text-text-muted">
            <IconChevronRight />
          </span>
        </Card>
      </Link>

      <div role="tabpanel">
        {tab === "income" || tab === "expense" ? (
          // Keyed by kind: categories differ, so filters start over per tab.
          <TransactionsPanel key={tab} kind={tab} month={month} onCreate={openCreateFlow} />
        ) : tab === "savings" ? (
          <SavingsPanel onCreate={openCreateFlow} />
        ) : (
          <DebtsPanel onCreate={openCreateFlow} />
        )}
      </div>

      {/* Floating above the tab bar; safe-area handled by the shell, not here. */}
      <button
        aria-label={CREATE_LABEL[tab]}
        onClick={() => openCreateFlow()}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl text-brand-contrast shadow-lg active:bg-brand-pressed md:bottom-6"
      >
        <IconPlus />
      </button>

      <Sheet open={goalSheetOpen} onClose={() => setGoalSheetOpen(false)} title="Nueva meta de ahorro">
        <SavingsGoalForm onDone={() => setGoalSheetOpen(false)} />
      </Sheet>
    </div>
  );
}
