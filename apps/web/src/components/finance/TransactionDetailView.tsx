"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { clientFetch } from "@/lib/api/client";
import { formatDayMonthYear } from "@/lib/dates";
import { pushToast } from "@/lib/toast";

import { MoneyDisplay } from "./MoneyDisplay";
import { PAYMENT_METHOD_LABEL, TransactionForm } from "./TransactionForm";
import { transactionTitle, type Transaction } from "./TransactionRow";
import { derivedSource } from "./transactionSource";

const FREQUENCY_LABEL: Record<string, string> = {
  monthly: "Mensual",
  biweekly: "Quincenal",
  once: "Único",
};

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="text-sm text-text-muted">{label}</span>
      <div className="flex min-w-0 flex-wrap justify-end gap-1.5 text-right text-sm font-medium">
        {children}
      </div>
    </div>
  );
}

export function TransactionDetailView({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Under "transactions" so every save or delete elsewhere refreshes it too.
  const query = useQuery({
    queryKey: ["transactions", "detail", transactionId],
    queryFn: () => clientFetch<Transaction>(`/me/transactions/${transactionId}`),
  });

  const remove = useMutation({
    mutationFn: () => clientFetch(`/me/transactions/${transactionId}`, { method: "DELETE" }),
    onSuccess: async () => {
      const transaction = query.data;
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["monthly-summary"] });
      pushToast({ message: "Movimiento eliminado", type: "info" });
      if (transaction) {
        router.push(
          `/finanzas?tab=${transaction.kind}&mes=${transaction.occurred_on.slice(0, 7)}`,
        );
      }
    },
  });

  if (query.isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />;
  }
  if (!query.data) {
    return <p className="text-sm text-text-muted">No encontramos este movimiento.</p>;
  }

  const transaction = query.data;
  const derived = derivedSource(transaction.source);
  const isIncome = transaction.kind === "income";

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col items-center gap-2 py-6 text-center">
        <div className="flex flex-wrap justify-center gap-1.5">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              isIncome ? "bg-income/15 text-income" : "bg-expense/15 text-expense"
            }`}
          >
            {isIncome ? "Ingreso" : "Gasto"}
          </span>
          {derived ? (
            <span className="rounded-full border border-brand px-2 py-0.5 text-xs font-semibold text-brand">
              {derived.pill}
            </span>
          ) : null}
        </div>
        <MoneyDisplay
          amountMinor={transaction.amount_minor}
          currency={transaction.currency}
          kind={transaction.kind}
          className="text-[2.25rem] font-bold leading-tight"
        />
        <h1 className="text-lg font-semibold">{transactionTitle(transaction)}</h1>
        <span className="text-sm text-text-muted">
          {formatDayMonthYear(transaction.occurred_on)}
        </span>
      </Card>

      <Card className="flex flex-col divide-y divide-border">
        <DetailRow label="Categorías">
          {transaction.categories.map((category) => (
            <span
              key={category.id}
              className="rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-xs font-semibold"
            >
              {category.name}
            </span>
          ))}
        </DetailRow>
        <DetailRow label="Método de pago">
          {PAYMENT_METHOD_LABEL[transaction.payment_method as keyof typeof PAYMENT_METHOD_LABEL] ??
            transaction.payment_method}
        </DetailRow>
        <DetailRow label="Se repite">
          {transaction.is_recurring
            ? (FREQUENCY_LABEL[transaction.frequency ?? ""] ?? "Sí")
            : "No se repite"}
        </DetailRow>
        {transaction.note ? (
          <DetailRow label="Nota">
            <span className="whitespace-pre-line">{transaction.note}</span>
          </DetailRow>
        ) : null}
      </Card>

      {derived ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">{derived.explanation}</p>
          <Link href={derived.href} className="text-sm font-semibold text-brand">
            {derived.linkLabel}
          </Link>
        </Card>
      ) : confirmingDelete ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm font-medium">¿Eliminar este movimiento? No se puede deshacer.</p>
          <div className="grid grid-cols-2 gap-2">
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
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Button type="button" variant="danger" onClick={() => setConfirmingDelete(true)}>
            Eliminar
          </Button>
        </div>
      )}

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title={isIncome ? "Editar ingreso" : "Editar gasto"}
      >
        <TransactionForm
          kind={transaction.kind}
          currency={transaction.currency}
          transaction={transaction}
          onDone={() => setEditing(false)}
        />
      </Sheet>
    </div>
  );
}
