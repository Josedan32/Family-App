"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { CategoryPicker } from "@/components/finance/CategoryPicker";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { clientFetch } from "@/lib/api/client";

interface Category {
  id: string;
  name: string;
  kind: string;
  is_system: boolean;
}

interface EditableTransaction {
  id: string;
  categories: { id: string; name: string }[];
  amount_minor: number;
  occurred_on: string;
  name: string | null;
  note: string | null;
}

export function TransactionForm({
  kind,
  currency,
  transaction,
  onDone,
}: {
  kind: "income" | "expense";
  currency: string;
  /** Present in edit mode: prefills the form and PATCHes instead of creating. */
  transaction?: EditableTransaction;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(transaction?.amount_minor ?? 0);
  const [amountTouched, setAmountTouched] = useState(false);
  const [categoryIds, setCategoryIds] = useState<string[]>(
    transaction?.categories.map((c) => c.id) ?? [],
  );
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [occurredOn, setOccurredOn] = useState(
    transaction?.occurred_on ?? new Date().toISOString().slice(0, 10),
  );
  const [name, setName] = useState(transaction?.name ?? "");
  const [note, setNote] = useState(transaction?.note ?? "");

  const amountError =
    amountTouched && amount <= 0 ? "Ingresa un monto mayor a cero" : undefined;
  const categoryError =
    categoryTouched && categoryIds.length === 0 ? "Elige al menos una categoría" : undefined;
  const canSubmit = amount > 0 && categoryIds.length > 0;

  const categories = useQuery({
    queryKey: ["categories", kind],
    queryFn: () => clientFetch<Category[]>(`/categories?kind=${kind}`),
  });

  const save = useMutation({
    mutationFn: () =>
      transaction
        ? clientFetch(`/me/transactions/${transaction.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              category_ids: categoryIds,
              amount_minor: amount,
              occurred_on: occurredOn,
              name: name || null,
              note: note || null,
            }),
          })
        : clientFetch("/me/transactions", {
            method: "POST",
            body: JSON.stringify({
              kind,
              category_ids: categoryIds,
              amount_minor: amount,
              occurred_on: occurredOn,
              name: name || null,
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
        setAmountTouched(true);
        setCategoryTouched(true);
        if (canSubmit) save.mutate();
      }}
    >
      <MoneyInput
        label="Monto"
        value={amount}
        onChange={setAmount}
        onBlur={() => setAmountTouched(true)}
        currency={currency}
        kind={kind}
        error={amountError}
        required
      />

      <CategoryPicker
        categories={categories.data}
        mode="multi"
        value={categoryIds}
        onChange={setCategoryIds}
      />
      {categoryError ? (
        <p role="alert" className="-mt-3 text-xs font-medium text-danger">
          {categoryError}
        </p>
      ) : null}

      {/* Native date input: iOS's own picker beats anything custom. */}
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

      {save.isError ? (
        <p role="alert" className="text-sm text-danger">
          {(save.error as Error).message}
        </p>
      ) : null}

      <Button type="submit" disabled={save.isPending || !canSubmit}>
        {save.isPending ? "Guardando…" : transaction ? "Guardar cambios" : "Guardar"}
      </Button>
    </form>
  );
}
