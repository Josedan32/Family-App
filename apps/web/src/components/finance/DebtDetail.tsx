"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { ApiError } from "@/lib/api/errors";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

import type { Debt } from "./DebtCard";
import { MoneyDisplay } from "./MoneyDisplay";

const PAYMENT_METHODS = ["cash", "nequi", "bancolombia"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  nequi: "Nequi",
  bancolombia: "Bancolombia",
};

interface Payment {
  id: string;
  amount_minor: number;
  paid_on: string;
  note: string | null;
  payment_method: PaymentMethod;
}

interface DebtDetailData extends Debt {
  payments: Payment[];
}

export function DebtDetail({ debt, onDeleted }: { debt: Debt; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["debt-detail", debt.id],
    queryFn: () => clientFetch<DebtDetailData>(`/me/debts/${debt.id}`),
  });

  const pay = useMutation({
    mutationFn: () =>
      clientFetch(`/me/debts/${debt.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount_minor: amount,
          paid_on: paidOn,
          note: note || null,
          payment_method: paymentMethod,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
      await queryClient.invalidateQueries({ queryKey: ["debt-detail", debt.id] });
      await queryClient.invalidateQueries({ queryKey: ["monthly-summary"] });
      setAmount(0);
      setNote("");
      setPaymentMethod("cash");
      pushToast({ message: "Abono registrado", type: "success" });
    },
  });

  const remove = useMutation({
    mutationFn: () => clientFetch(`/me/debts/${debt.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
      pushToast({ message: "Deuda eliminada", type: "info" });
      onDeleted();
    },
    onError: (error) => {
      setDeleteError(
        error instanceof ApiError && error.type === "debt_has_payments"
          ? "No se puede borrar: elimina primero los pagos registrados."
          : (error as Error).message,
      );
      setConfirmingDelete(false);
    },
  });

  const canPay = debt.status !== "paid";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-sunken p-3.5">
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-muted">Deuda original</span>
          <MoneyDisplay amountMinor={debt.principal_minor} currency={debt.currency} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-muted">Saldo pendiente</span>
          <MoneyDisplay amountMinor={debt.outstanding_minor} currency={debt.currency} kind="debt" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-muted">Total abonado</span>
          <MoneyDisplay amountMinor={debt.paid_total_minor} currency={debt.currency} />
        </div>
        {debt.annual_interest_rate !== null ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-muted">Tasa de interés anual</span>
            <span>{debt.annual_interest_rate}%</span>
          </div>
        ) : null}
        {debt.minimum_payment_minor ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-muted">Pago mínimo mensual</span>
            <MoneyDisplay amountMinor={debt.minimum_payment_minor} currency={debt.currency} />
          </div>
        ) : null}
        {debt.due_day ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-muted">Día de corte</span>
            <span>{debt.due_day}</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Pagos registrados
        </span>
        {detail.isLoading ? null : detail.data?.payments.length ? (
          <ul className="flex flex-col gap-1.5">
            {detail.data.payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between text-sm">
                <span className="text-text-muted">
                  {payment.paid_on} · {PAYMENT_METHOD_LABEL[payment.payment_method]}
                  {payment.note ? ` · ${payment.note}` : ""}
                </span>
                <MoneyDisplay amountMinor={payment.amount_minor} currency={debt.currency} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">Todavía no hay pagos.</p>
        )}
      </div>

      {canPay ? (
        <form
          className="flex flex-col gap-3 border-t border-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            pay.mutate();
          }}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Registrar abono
          </span>
          <MoneyInput label="Monto" value={amount} onChange={setAmount} currency={debt.currency} kind="debt" />
          <Input
            label="Fecha"
            type="date"
            required
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
          />
          <Input label="Nota (opcional)" value={note} onChange={(event) => setNote(event.target.value)} />
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
          {pay.isError ? (
            <p role="alert" className="text-sm text-danger">
              {(pay.error as Error).message}
            </p>
          ) : null}
          <Button type="submit" disabled={pay.isPending || amount <= 0}>
            {pay.isPending ? "Guardando…" : "Registrar abono"}
          </Button>
        </form>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        {deleteError ? (
          <p role="alert" className="text-sm text-danger">
            {deleteError}
          </p>
        ) : null}
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-sm text-text-muted">¿Eliminar esta deuda?</span>
            <Button type="button" variant="secondary" onClick={() => setConfirmingDelete(false)}>
              No
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Sí, eliminar
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setConfirmingDelete(true);
            }}
            className="self-start text-sm font-semibold text-danger"
          >
            Eliminar deuda
          </button>
        )}
      </div>
    </div>
  );
}
