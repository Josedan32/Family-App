"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { clientFetch } from "@/lib/api/client";
import type { CreditCard } from "@/lib/creditCards";
import {
  daysBetween,
  formatDateRange,
  formatDayMonthYear,
  todayLocal,
} from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { pushToast } from "@/lib/toast";

import { isIsoDate } from "./decimal";

type Choice = "minimum" | "full" | "other";

function dueCopy(days: number): string {
  if (days === 0) return "hoy";
  if (days === 1) return "en 1 día";
  if (days > 1) return `en ${days} días`;
  return days === -1 ? "venció hace 1 día" : `venció hace ${-days} días`;
}

export function PaymentForm({ card, onDone }: { card: CreditCard; onDone: () => void }) {
  const queryClient = useQueryClient();
  const statement = card.latest_statement;
  const [choice, setChoice] = useState<Choice>(statement ? "full" : "other");
  const [amount, setAmount] = useState(statement ? card.outstanding_minor : 0);
  const [amountTouched, setAmountTouched] = useState(false);
  const [paidOn, setPaidOn] = useState(todayLocal());
  const [note, setNote] = useState("");

  const create = useMutation({
    mutationFn: () =>
      clientFetch(`/me/credit-cards/${card.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount_minor: amount, paid_on: paidOn, note: note || null }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["credit-cards"] });
      await queryClient.invalidateQueries({ queryKey: ["credit-card", card.id] });
      pushToast({ message: "Pago registrado", type: "success" });
      onDone();
    },
  });

  const canSubmit = amount > 0 && isIsoDate(paidOn);
  const amountError =
    amountTouched && amount <= 0 ? "Ingresa un monto mayor a cero" : undefined;

  const shortcuts: { value: Choice; label: string; figure: number | null; pick: () => void }[] =
    statement
      ? [
          {
            value: "minimum",
            label: "Pago mínimo",
            figure: statement.minimum_payment_minor,
            pick: () => setAmount(statement.minimum_payment_minor),
          },
          {
            value: "full",
            label: "Saldo pendiente",
            figure: card.outstanding_minor,
            pick: () => setAmount(card.outstanding_minor),
          },
          { value: "other", label: "Otro valor", figure: null, pick: () => setAmount(0) },
        ]
      : [];

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setAmountTouched(true);
        if (canSubmit) create.mutate();
      }}
    >
      {statement ? (
        <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface-sunken p-3.5 text-sm">
          <span>
            Extracto {formatDateRange(statement.cycle_starts_on, statement.cycle_ends_on)}
          </span>
          <span className="text-text-muted">
            Fecha límite de pago {formatDayMonthYear(statement.payment_due_on)},{" "}
            {dueCopy(daysBetween(todayLocal(), statement.payment_due_on))}
          </span>
        </div>
      ) : null}

      {statement ? (
        <div role="radiogroup" aria-label="Valor a pagar" className="grid grid-cols-1 gap-2">
          {shortcuts.map(({ value, label, figure, pick }) => {
            const selected = choice === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setChoice(value);
                  pick();
                }}
                className={`flex min-h-[48px] items-center justify-between rounded-xl border px-3.5 text-sm font-medium ${
                  selected
                    ? "border-brand bg-brand font-bold text-brand-contrast"
                    : "border-border bg-surface text-text active:bg-surface-sunken"
                }`}
              >
                <span>{label}</span>
                {figure !== null ? (
                  <span className="tabular">{formatMoney(figure, card.currency)}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <MoneyInput
        label="Monto"
        value={amount}
        onChange={(value) => {
          setAmount(value);
          setChoice("other");
        }}
        onBlur={() => setAmountTouched(true)}
        currency={card.currency}
        error={amountError}
        required
      />

      <Input
        label="Fecha"
        type="date"
        required
        value={paidOn}
        onChange={(e) => setPaidOn(e.target.value)}
      />
      <Input label="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />

      {create.isError ? (
        <p role="alert" className="text-sm text-danger">
          {(create.error as Error).message}
        </p>
      ) : null}
      <Button type="submit" disabled={!canSubmit || create.isPending}>
        {create.isPending ? "Guardando…" : "Registrar pago"}
      </Button>
    </form>
  );
}
