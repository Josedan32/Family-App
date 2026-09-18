"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { clientFetch } from "@/lib/api/client";
import { formatMoney } from "@/lib/money";
import { useMediaQuery } from "@/lib/useMediaQuery";

export interface MonthlySummary {
  period: string;
  currency: string;
  income_minor: number;
  expenses_minor: number;
  saved_minor: number;
  debt_payments_minor: number;
  remaining_minor: number;
  status: "healthy" | "tight" | "overspent";
}

const STATUS_COPY: Record<MonthlySummary["status"], { label: string; className: string }> = {
  healthy: { label: "Saludable", className: "text-savings" },
  tight: { label: "Ajustado", className: "text-warning" },
  overspent: { label: "En descubierto", className: "text-danger" },
};

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

interface Row {
  label: string;
  amountMinor: number;
  className?: string;
}

function SummaryRow({ label, amountMinor, currency, className = "" }: Row & { currency: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={`font-medium ${className || "text-text-muted"}`}>{label}</span>
      <span className={`tabular font-medium ${className}`}>{formatMoney(amountMinor, currency)}</span>
    </div>
  );
}

/** Fetches from a caller-supplied path so this same card serves both
 * `/me/monthly-summary` (own data) and `/members/{id}/monthly-summary`
 * (another member's, subject to visibility gating server-side). */
export function MonthlySummaryCard({ endpoint }: { endpoint: string }) {
  const [period, setPeriod] = useState(currentPeriod());
  // Collapsed by default on narrow viewports so it doesn't push the rest of
  // the page below the fold — expanded is the right default on desktop,
  // where there's room for it beside everything else. Until the member
  // toggles it, the screen decides.
  const wide = useMediaQuery("(min-width: 768px)", true);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const expanded = chosen ?? wide;

  const summary = useQuery({
    queryKey: ["monthly-summary", endpoint, period],
    queryFn: () => clientFetch<MonthlySummary>(`${endpoint}?period=${period}`),
  });

  const status = summary.data ? STATUS_COPY[summary.data.status] : null;

  return (
    <Card className="flex flex-col gap-3.5">
      <button
        type="button"
        onClick={() => setChosen(!expanded)}
        aria-expanded={expanded}
        className="flex items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="text-xs text-text-muted">
            {expanded ? "▾" : "▸"}
          </span>
          <h2 className="text-base font-semibold">Resumen mensual</h2>
        </span>
        {expanded ? (
          <label
            className="flex items-center gap-1.5 text-xs text-text-muted"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="sr-only">Mes</span>
            <input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs"
            />
          </label>
        ) : summary.data ? (
          <span className="tabular text-sm font-semibold">
            {formatMoney(summary.data.remaining_minor, summary.data.currency)}
          </span>
        ) : null}
      </button>

      {!expanded ? null : summary.isLoading ? null : summary.data ? (
        <>
          <div className="flex flex-col gap-1.5">
            <SummaryRow
              label="Ingresos"
              amountMinor={summary.data.income_minor}
              currency={summary.data.currency}
              className="text-income"
            />
            <SummaryRow
              label="Gastos"
              amountMinor={summary.data.expenses_minor}
              currency={summary.data.currency}
              className="text-expense"
            />
            <SummaryRow
              label="Ahorrado"
              amountMinor={summary.data.saved_minor}
              currency={summary.data.currency}
              className="text-savings"
            />
            <SummaryRow
              label="Pagos de deuda"
              amountMinor={summary.data.debt_payments_minor}
              currency={summary.data.currency}
              className="text-debt"
            />
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="flex flex-col">
              <span className="text-xs text-text-muted">Restante</span>
              <span className="tabular text-lg font-bold">
                {formatMoney(summary.data.remaining_minor, summary.data.currency)}
              </span>
            </div>
            {status ? (
              <span className={`text-sm font-semibold ${status.className}`}>{status.label}</span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-text-muted">No hay datos para este mes.</p>
      )}
    </Card>
  );
}
