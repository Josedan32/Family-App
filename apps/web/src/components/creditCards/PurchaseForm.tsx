"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { CategoryPicker } from "@/components/finance/CategoryPicker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { clientFetch } from "@/lib/api/client";
import type { CreditCard } from "@/lib/creditCards";
import { formatDayMonth, nextCutoffOn, todayLocal } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { pushToast } from "@/lib/toast";

interface Category {
  id: string;
  name: string;
  kind: string;
  is_contribution_category: boolean;
}

const PRESETS = [3, 6, 12, 24];

export function PurchaseForm({ card, onDone }: { card: CreditCard; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [amount, setAmount] = useState(0);
  const [amountTouched, setAmountTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [purchasedOn, setPurchasedOn] = useState(todayLocal());
  const [installments, setInstallments] = useState(false);
  const [total, setTotal] = useState(0);
  const [customTotal, setCustomTotal] = useState(false);
  const [installmentAmount, setInstallmentAmount] = useState(0);
  const [firstOverride, setFirstOverride] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ["categories", "expense"],
    queryFn: () => clientFetch<Category[]>("/categories?kind=expense"),
  });

  const cutoffAfterPurchase = nextCutoffOn(card.statement_cutoff_day, purchasedOn);
  const first = firstOverride ?? cutoffAfterPurchase;

  const create = useMutation({
    mutationFn: () =>
      clientFetch(`/me/credit-cards/${card.id}/purchases`, {
        method: "POST",
        body: JSON.stringify({
          description,
          category_id: categoryId || null,
          amount_minor: amount,
          purchased_on: purchasedOn,
          ...(installments
            ? {
                installments_total: total,
                installment_amount_minor: installmentAmount,
                first_installment_on: first,
              }
            : {}),
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["credit-cards"] });
      await queryClient.invalidateQueries({ queryKey: ["credit-card", card.id] });
      pushToast({ message: "Compra registrada", type: "success" });
      onDone();
    },
  });

  const planComplete = total >= 2 && installmentAmount > 0 && !!first;
  const canSubmit = !!description && amount > 0 && (!installments || planComplete);
  const descriptionError = descriptionTouched && !description ? "Describe la compra" : undefined;
  const amountError = amountTouched && amount <= 0 ? "Ingresa un monto mayor a cero" : undefined;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setDescriptionTouched(true);
        setAmountTouched(true);
        if (canSubmit) create.mutate();
      }}
    >
      <Input
        label="Descripción"
        required
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => setDescriptionTouched(true)}
        error={descriptionError}
      />
      <MoneyInput
        label="Monto"
        value={amount}
        onChange={setAmount}
        onBlur={() => setAmountTouched(true)}
        currency={card.currency}
        error={amountError}
        required
      />
      <span className="-mt-3 text-xs text-text-muted">
        Queda en el ciclo abierto hasta el corte del {formatDayMonth(cutoffAfterPurchase)}. No
        cuenta como gasto.
      </span>

      <CategoryPicker
        categories={categories.data}
        value={categoryId}
        onChange={setCategoryId}
        label="Categoría (opcional)"
      />

      <Input
        label="Fecha de compra"
        type="date"
        required
        value={purchasedOn}
        onChange={(e) => setPurchasedOn(e.target.value)}
      />

      <button
        type="button"
        role="switch"
        aria-checked={installments}
        onClick={() => setInstallments(!installments)}
        className="flex min-h-[48px] items-center justify-between rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold"
      >
        <span>A cuotas (diferido)</span>
        <span aria-hidden="true">{installments ? "Sí" : "No"}</span>
      </button>

      {installments ? (
        <div className="flex flex-col gap-5 rounded-xl border border-border p-3.5">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Número de cuotas
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => {
                const selected = !customTotal && total === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setCustomTotal(false);
                      setTotal(preset);
                    }}
                    className={`min-h-9 rounded-full border px-3 text-sm font-medium ${
                      selected
                        ? "border-brand bg-brand font-bold text-brand-contrast"
                        : "border-border bg-surface text-text active:bg-surface-sunken"
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={customTotal}
                onClick={() => setCustomTotal(true)}
                className={`min-h-9 rounded-full border px-3 text-sm font-medium ${
                  customTotal
                    ? "border-brand bg-brand font-bold text-brand-contrast"
                    : "border-border bg-surface text-text active:bg-surface-sunken"
                }`}
              >
                Otro
              </button>
            </div>
          </div>
          {customTotal ? (
            <Input
              label="Número de cuotas"
              type="number"
              inputMode="numeric"
              min={2}
              max={120}
              value={total === 0 ? "" : String(total)}
              onChange={(e) => setTotal(Number(e.target.value))}
            />
          ) : null}
          <MoneyInput
            label="Valor cuota"
            value={installmentAmount}
            onChange={setInstallmentAmount}
            currency={card.currency}
            required
          />
          <Input
            label="Primera cuota"
            type="date"
            required
            value={first}
            onChange={(e) => setFirstOverride(e.target.value)}
          />
          {planComplete ? (
            <span className="text-xs text-text-muted">
              {total} cuotas de {formatMoney(installmentAmount, card.currency)}, desde el extracto
              que cierra el {formatDayMonth(first)}.
            </span>
          ) : null}
        </div>
      ) : null}

      {create.isError ? (
        <p role="alert" className="text-sm text-danger">
          {(create.error as Error).message}
        </p>
      ) : null}
      <Button type="submit" disabled={!canSubmit || create.isPending}>
        {create.isPending ? "Guardando…" : "Registrar compra"}
      </Button>
    </form>
  );
}
