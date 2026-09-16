"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

import { MoneyDisplay } from "./MoneyDisplay";
import type { Goal } from "./GoalCard";

interface Entry {
  id: string;
  kind: "deposit" | "withdrawal";
  amount_minor: number;
  occurred_on: string;
  note: string | null;
  currency: string;
}

function ActivityList({ goalId }: { goalId: string }) {
  const entries = useQuery({
    queryKey: ["savings-entries", goalId],
    queryFn: () => clientFetch<Entry[]>(`/me/savings-goals/${goalId}/entries`),
  });

  if (entries.isLoading) return null;
  if (!entries.data?.length) {
    return <p className="text-sm text-text-muted">Todavía no hay movimientos.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.data.map((entry) => (
        <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
          <div className="flex flex-col">
            <span>{entry.kind === "deposit" ? "Abono" : "Retiro"}</span>
            <span className="text-xs text-text-muted">{entry.occurred_on}</span>
            {entry.note ? <span className="text-xs text-text-muted">{entry.note}</span> : null}
          </div>
          <MoneyDisplay
            amountMinor={entry.amount_minor}
            currency={entry.currency}
            kind={entry.kind === "deposit" ? "income" : "expense"}
            className="font-semibold"
          />
        </li>
      ))}
    </ul>
  );
}

export function GoalDetail({ goal }: { goal: Goal }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState(0);
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));
  const [showActivity, setShowActivity] = useState(false);

  const addEntry = useMutation({
    mutationFn: () =>
      clientFetch(`/me/savings-goals/${goal.id}/entries`, {
        method: "POST",
        body: JSON.stringify({ kind, amount_minor: amount, occurred_on: occurredOn }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["savings-goals"] });
      await queryClient.invalidateQueries({ queryKey: ["savings-entries", goal.id] });
      setAmount(0);
      pushToast({
        message: kind === "deposit" ? "Abono registrado" : "Retiro registrado",
        type: "success",
      });
    },
  });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-sunken p-3.5">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          addEntry.mutate();
        }}
      >
        <div
          role="radiogroup"
          aria-label="Tipo de movimiento"
          className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={kind === "deposit"}
            onClick={() => setKind("deposit")}
            className={`min-h-[44px] rounded-lg text-sm font-semibold ${
              kind === "deposit" ? "bg-brand text-brand-contrast" : "text-text-muted"
            }`}
          >
            Abonar
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={kind === "withdrawal"}
            onClick={() => setKind("withdrawal")}
            className={`min-h-[44px] rounded-lg text-sm font-semibold ${
              kind === "withdrawal" ? "bg-brand text-brand-contrast" : "text-text-muted"
            }`}
          >
            Retirar
          </button>
        </div>
        <MoneyInput
          label="Monto"
          value={amount}
          onChange={setAmount}
          currency={goal.currency}
          kind="savings"
        />
        <Input
          label="Fecha"
          type="date"
          required
          value={occurredOn}
          onChange={(event) => setOccurredOn(event.target.value)}
        />
        {addEntry.isError ? (
          <p role="alert" className="text-sm text-danger">
            {(addEntry.error as Error).message}
          </p>
        ) : null}
        <Button type="submit" disabled={addEntry.isPending || amount <= 0}>
          {addEntry.isPending ? "Guardando…" : kind === "deposit" ? "Abonar" : "Retirar"}
        </Button>
      </form>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setShowActivity((v) => !v)}
          className="self-start text-sm font-semibold text-brand"
        >
          {showActivity ? "Ocultar actividad" : "Ver actividad"}
        </button>
        {showActivity ? <ActivityList goalId={goal.id} /> : null}
      </div>
    </div>
  );
}
