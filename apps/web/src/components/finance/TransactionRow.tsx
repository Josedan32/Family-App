"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

import { MoneyDisplay } from "./MoneyDisplay";
import { TransactionForm } from "./TransactionForm";

export interface Transaction {
  id: string;
  kind: "income" | "expense";
  categories: { id: string; name: string }[];
  amount_minor: number;
  currency: string;
  occurred_on: string;
  name: string | null;
  note: string | null;
  source: string;
  is_recurring: boolean;
  frequency: string | null;
  payment_method: string;
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isDerived = transaction.source !== "manual";
  const categoryNames = transaction.categories.map((c) => c.name).join(" · ");

  const remove = useMutation({
    mutationFn: () => clientFetch(`/me/transactions/${transaction.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      pushToast({ message: "Movimiento eliminado", type: "info" });
    },
  });

  return (
    <li
      className={`flex flex-col gap-2 rounded-2xl border border-border p-3.5 ${
        isDerived ? "bg-surface-sunken" : "bg-surface"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-bold">{transaction.name || categoryNames}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {transaction.name
              ? transaction.categories.map((category) => (
                  <span
                    key={category.id}
                    className="rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-text-muted"
                  >
                    {category.name}
                  </span>
                ))
              : null}
            {isDerived ? (
              <span className="rounded-full border border-brand px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-brand">
                Aporte
              </span>
            ) : null}
          </div>
          {transaction.note ? (
            <span className="text-sm text-text-muted">{transaction.note}</span>
          ) : null}
          <span className="text-xs tracking-wide text-text-muted">
            {transaction.occurred_on}
          </span>
        </div>
        <MoneyDisplay
          amountMinor={transaction.amount_minor}
          currency={transaction.currency}
          kind={transaction.kind}
          className="whitespace-nowrap text-xl font-bold"
        />
      </div>

      {isDerived ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
          <span className="text-xs text-text-muted">
            Se registra automáticamente desde Aportes.
          </span>
          <a href="/aportes" className="whitespace-nowrap text-sm font-semibold text-brand">
            Ver aportes ›
          </a>
        </div>
      ) : (
        <div className="flex items-center gap-3 border-t border-border pt-2.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-semibold text-brand"
          >
            Editar
          </button>
          {confirmingDelete ? (
            <div className="flex flex-1 items-center justify-end gap-2">
              <span className="text-sm text-text-muted">¿Eliminar?</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirmingDelete(false)}
              >
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
              onClick={() => setConfirmingDelete(true)}
              className="text-sm font-semibold text-danger"
            >
              Eliminar
            </button>
          )}
        </div>
      )}

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title={transaction.kind === "income" ? "Editar ingreso" : "Editar gasto"}
      >
        <TransactionForm
          kind={transaction.kind}
          currency={transaction.currency}
          transaction={transaction}
          onDone={() => setEditing(false)}
        />
      </Sheet>
    </li>
  );
}
