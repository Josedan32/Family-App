"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { MoneyInput } from "@/components/ui/MoneyInput";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { clientFetch } from "@/lib/api/client";

interface Category {
  id: string;
  name: string;
  kind: string;
}

export function TransactionForm({
  kind,
  currency,
  onDone,
}: {
  kind: "income" | "expense";
  currency: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const categories = useQuery({
    queryKey: ["categories", kind],
    queryFn: () => clientFetch<Category[]>(`/categories?kind=${kind}`),
  });

  const create = useMutation({
    mutationFn: () =>
      clientFetch("/me/transactions", {
        method: "POST",
        body: JSON.stringify({
          kind,
          category_id: categoryId,
          amount_minor: amount,
          occurred_on: occurredOn,
          note: note || null,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
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
      <MoneyInput
        label="Monto"
        value={amount}
        onChange={setAmount}
        currency={currency}
        required
      />

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Categoría
        </span>
        <div role="radiogroup" aria-label="Categoría" className="grid grid-cols-3 gap-2">
          {categories.data?.map((category) => {
            const selected = category.id === categoryId;
            return (
              <button
                key={category.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setCategoryId(category.id)}
                className={`min-h-[48px] rounded-xl border px-1 text-sm font-medium ${
                  selected
                    ? "border-brand bg-brand font-bold text-brand-contrast"
                    : "border-border bg-surface text-text active:bg-surface-sunken"
                }`}
              >
                {category.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Native date input: iOS's own picker beats anything custom. */}
      <Input
        label="Fecha"
        type="date"
        required
        value={occurredOn}
        onChange={(event) => setOccurredOn(event.target.value)}
      />
      <Input
        label="Nota (opcional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      {create.isError ? (
        <p role="alert" className="text-sm text-danger">
          {(create.error as Error).message}
        </p>
      ) : null}

      <Button type="submit" disabled={create.isPending || amount <= 0 || !categoryId}>
        {create.isPending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
