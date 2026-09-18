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
  is_contribution_category: boolean;
}

interface EditableTransaction {
  id: string;
  categories: { id: string; name: string }[];
  amount_minor: number;
  occurred_on: string;
  name: string | null;
  note: string | null;
  is_recurring: boolean;
  frequency: string | null;
  payment_method: string;
}

const FREQUENCIES = ["monthly", "once", "biweekly"] as const;
type Frequency = (typeof FREQUENCIES)[number];

const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: "Mensual",
  once: "Único",
  biweekly: "Quincenal",
};

const PAYMENT_METHODS = ["cash", "nequi", "bancolombia"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  nequi: "Nequi",
  bancolombia: "Bancolombia",
};

function isFrequency(value: string | null | undefined): value is Frequency {
  return FREQUENCIES.includes(value as Frequency);
}

function isPaymentMethod(value: string | null | undefined): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod);
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
  const [isRecurring, setIsRecurring] = useState(transaction?.is_recurring ?? false);
  const [frequency, setFrequency] = useState<Frequency>(
    isFrequency(transaction?.frequency) ? transaction.frequency : "monthly",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    isPaymentMethod(transaction?.payment_method) ? transaction.payment_method : "cash",
  );

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
              is_recurring: isRecurring,
              frequency: isRecurring ? frequency : null,
              payment_method: paymentMethod,
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
              is_recurring: isRecurring,
              frequency: isRecurring ? frequency : null,
              payment_method: paymentMethod,
            }),
          }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["monthly-summary"] });
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

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Método de pago
        </span>
        <div role="radiogroup" aria-label="Método de pago" className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((value) => {
            const selected = paymentMethod === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPaymentMethod(value)}
                className={`min-h-[48px] rounded-xl border px-1 text-sm font-medium ${
                  selected
                    ? "border-brand bg-brand font-bold text-brand-contrast"
                    : "border-border bg-surface text-text active:bg-surface-sunken"
                }`}
              >
                {PAYMENT_METHOD_LABEL[value]}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={(event) => setIsRecurring(event.target.checked)}
          className="mt-0.5 h-5 w-5 flex-none"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">Es un movimiento recurrente</span>
          <span className="text-xs text-text-muted">Se repite con la frecuencia que elijas.</span>
        </span>
      </label>

      {isRecurring ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Frecuencia
          </span>
          <div role="radiogroup" aria-label="Frecuencia" className="grid grid-cols-3 gap-2">
            {FREQUENCIES.map((value) => {
              const selected = frequency === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setFrequency(value)}
                  className={`min-h-[48px] rounded-xl border px-1 text-sm font-medium ${
                    selected
                      ? "border-brand bg-brand font-bold text-brand-contrast"
                      : "border-border bg-surface text-text active:bg-surface-sunken"
                  }`}
                >
                  {FREQUENCY_LABEL[value]}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

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
