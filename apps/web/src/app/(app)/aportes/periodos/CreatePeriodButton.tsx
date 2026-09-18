"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Sheet } from "@/components/ui/Sheet";
import { clientFetch } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { pushToast } from "@/lib/toast";

function firstOfNextMonth(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toISOString().slice(0, 10);
}

export function CreatePeriodButton({ currency }: { currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [periodMonth, setPeriodMonth] = useState(firstOfNextMonth());
  const [goalAmount, setGoalAmount] = useState(0);
  const [goalTouched, setGoalTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goalError = goalTouched && goalAmount <= 0 ? "Ingresa un monto mayor a cero" : undefined;
  const canSubmit = !!periodMonth && goalAmount > 0;

  const create = useMutation({
    mutationFn: () =>
      clientFetch("/contribution-periods", {
        method: "POST",
        body: JSON.stringify({ period_month: periodMonth, goal_amount_minor: goalAmount }),
      }),
    onSuccess: () => {
      pushToast({ message: "Periodo creado", type: "success" });
      setOpen(false);
      setGoalAmount(0);
      setGoalTouched(false);
      router.refresh();
    },
    onError: (err: unknown) => {
      setError(
        err instanceof ApiError && err.type === "period_exists"
          ? err.message
          : "No se pudo crear el periodo",
      );
    },
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>Crear periodo</Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Crear periodo">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            setGoalTouched(true);
            setError(null);
            if (canSubmit) create.mutate();
          }}
        >
          <Input
            label="Mes"
            type="month"
            required
            value={periodMonth.slice(0, 7)}
            onChange={(event) => setPeriodMonth(`${event.target.value}-01`)}
          />
          <MoneyInput
            label="Meta del hogar"
            value={goalAmount}
            onChange={setGoalAmount}
            onBlur={() => setGoalTouched(true)}
            currency={currency}
            error={goalError}
            required
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={create.isPending || !canSubmit}>
            {create.isPending ? "Creando…" : "Crear"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
