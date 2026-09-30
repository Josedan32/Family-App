"use client";

import { useEffect, useRef } from "react";

import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { IconLock } from "@/components/ui/Icons";
import type { CreditCardStatement } from "@/lib/creditCards";
import { formatDateRange } from "@/lib/dates";

interface Props {
  open: boolean;
  kind: "purchase" | "payment";
  entry: { title: string; detail: string; amountMinor: number };
  statement: CreditCardStatement;
  currency: string;
  onClose: () => void;
  onViewStatement: () => void;
}

const WORDING = {
  purchase: { title: "Esta compra ya está en un extracto cerrado", noun: "una compra" },
  payment: { title: "Este pago ya está en un extracto cerrado", noun: "un pago" },
} as const;

/** Explains why a purchase or payment cannot be deleted once a statement closed over it. */
export function BilledSheet({
  open,
  kind,
  entry,
  statement,
  currency,
  onClose,
  onViewStatement,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Callers pass an inline onClose; reading it through a ref keeps the effect tied to `open`.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    confirmRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const { title, noun } = WORDING[kind];

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end bg-black/45">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="billed-sheet-title"
        className="mx-auto flex w-full flex-col gap-4 rounded-t-3xl bg-bg p-5 md:max-w-lg"
      >
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-warning bg-surface-sunken text-warning"
        >
          <IconLock width={22} height={22} />
        </span>
        <div className="flex flex-col gap-1.5">
          <h3 id="billed-sheet-title" className="text-xl font-bold tracking-tight">
            {title}
          </h3>
          <p className="text-[0.9375rem] text-text-muted">
            El extracto es el registro de lo que te facturó el banco en ese corte. No se edita
            ni se recalcula, así que no se puede borrar {noun} que ya quedó dentro de él.
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-sunken px-3.5 py-3">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[0.9375rem] font-semibold">{entry.title}</span>
              <span className="text-[0.8125rem] text-text-muted">{entry.detail}</span>
            </div>
            <MoneyDisplay
              amountMinor={entry.amountMinor}
              currency={currency}
              className="text-[0.9375rem] font-bold"
            />
          </div>
          <span className="tabular border-t border-dashed border-border pt-2 text-[0.8125rem] text-text-muted">
            Incluida en el extracto{" "}
            {formatDateRange(statement.cycle_starts_on, statement.cycle_ends_on)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onViewStatement}
            className="min-h-[52px] rounded-2xl border border-border bg-surface text-[0.9375rem] font-semibold"
          >
            Ver extracto
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onClose}
            className="min-h-[52px] rounded-2xl bg-brand text-[0.9375rem] font-bold text-brand-contrast"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
