"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CategoryPicker } from "@/components/finance/CategoryPicker";
import { Button } from "@/components/ui/Button";
import { IconPlus } from "@/components/ui/Icons";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Sheet } from "@/components/ui/Sheet";
import { ApiError } from "@/lib/api/errors";
import { clientFetch } from "@/lib/api/client";
import { formatMoney } from "@/lib/money";
import { pushToast } from "@/lib/toast";

interface Category {
  id: string;
  name: string;
  kind: string;
  is_system: boolean;
}

type Funding = "pot" | "member";

function NewExpenseForm({
  currency,
  potBalanceMinor,
  onDone,
}: {
  currency: string;
  potBalanceMinor: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [funding, setFunding] = useState<Funding>("pot");
  const [countsAsContribution, setCountsAsContribution] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ["categories", "expense"],
    queryFn: () => clientFetch<Category[]>("/categories?kind=expense"),
  });

  const create = useMutation({
    mutationFn: () =>
      clientFetch("/household-expenses", {
        method: "POST",
        body: JSON.stringify({
          category_id: categoryId,
          amount_minor: amount,
          occurred_on: occurredOn,
          name: name || null,
          note: note || null,
          funding,
          ...(funding === "member" ? { counts_as_contribution: countsAsContribution } : {}),
        }),
      }),
    onError: (error) => {
      // Branch on the slug, never the title (docs/api-contract.md) — the pot
      // figure below comes from what THIS screen already knows, not from the
      // API's static error copy.
      if (error instanceof ApiError && error.type === "insufficient_pot") {
        setFormError(
          `El pozo no alcanza. Saldo disponible: ${formatMoney(potBalanceMinor, currency)}.`,
        );
      } else if (error instanceof ApiError && error.type === "no_open_period") {
        setFormError("No hay un periodo de aportes abierto este mes.");
      } else {
        setFormError((error as Error).message);
      }
    },
    onSuccess: async () => {
      router.refresh();
      pushToast({ message: "Gasto registrado", type: "success" });
      onDone();
    },
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setFormError(null);
        create.mutate();
      }}
    >
      <MoneyInput
        label="Monto"
        value={amount}
        onChange={setAmount}
        currency={currency}
        kind="expense"
        required
      />

      {funding === "pot" ? (
        <span className="-mt-3 text-xs text-text-muted">
          Disponible en el pozo: {formatMoney(potBalanceMinor, currency)}
        </span>
      ) : null}

      <CategoryPicker categories={categories.data} value={categoryId} onChange={setCategoryId} />

      <Input
        label="Fecha"
        type="date"
        required
        value={occurredOn}
        onChange={(event) => setOccurredOn(event.target.value)}
      />
      <Input
        label="Nombre (opcional)"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        label="Nota (opcional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          ¿De dónde salió la plata?
        </span>
        <div
          role="radiogroup"
          aria-label="Fondeo"
          className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-sunken p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={funding === "pot"}
            onClick={() => setFunding("pot")}
            className={`min-h-[48px] rounded-lg text-sm font-semibold ${
              funding === "pot" ? "bg-brand text-brand-contrast" : "text-text-muted"
            }`}
          >
            Del pozo
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={funding === "member"}
            onClick={() => setFunding("member")}
            className={`min-h-[48px] rounded-lg text-sm font-semibold ${
              funding === "member" ? "bg-brand text-brand-contrast" : "text-text-muted"
            }`}
          >
            Lo pagué yo
          </button>
        </div>
      </div>

      {funding === "member" ? (
        <label className="flex items-start gap-3 rounded-xl border border-brand bg-surface p-3.5">
          <input
            type="checkbox"
            checked={countsAsContribution}
            onChange={(event) => setCountsAsContribution(event.target.checked)}
            className="mt-0.5 h-5 w-5 flex-none"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">Que cuente como mi aporte del mes</span>
            <span className="text-xs text-text-muted">
              El dinero salió de tu bolsillo, así que suma a la meta del hogar pero no al pozo.
            </span>
          </span>
        </label>
      ) : null}

      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={create.isPending || amount <= 0 || !categoryId}>
        {create.isPending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

export function NewExpenseButton({
  currency,
  potBalanceMinor,
}: {
  currency: string;
  potBalanceMinor: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-label="Agregar gasto del hogar"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl text-brand-contrast shadow-lg active:bg-brand-pressed md:bottom-6"
      >
        <IconPlus />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Nuevo gasto del hogar">
        <NewExpenseForm
          currency={currency}
          potBalanceMinor={potBalanceMinor}
          onDone={() => setOpen(false)}
        />
      </Sheet>
    </>
  );
}
