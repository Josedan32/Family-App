"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { clientFetch } from "@/lib/api/client";
import { formatMoney } from "@/lib/money";

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
}

function SummaryRow({ label, amountMinor, currency }: Row & { currency: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="tabular font-medium">{formatMoney(amountMinor, currency)}</span>
    </div>
  );
}

/** Fetches from a caller-supplied path so this same card serves both
 * `/me/monthly-summary` (own data) and `/members/{id}/monthly-summary`
 * (another member's, subject to visibility gating server-side). */
export function MonthlySummaryCard({ endpoint }: { endpoint: string }) {
  const [period, setPeriod] = useState(currentPeriod());

  const summary = useQuery({
    queryKey: ["monthly-summary", endpoint, period],
    queryFn: () => clientFetch<MonthlySummary>(`${endpoint}?period=${period}`),
  });

  const status = summary.data ? STATUS_COPY[summary.data.status] : null;

  return (
    <Card className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Resumen mensual</h2>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          <span className="sr-only">Mes</span>
          <input
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs"
          />
        </label>
      </div>

      {summary.isLoading ? null : summary.data ? (
        <>
          <div className="flex flex-col gap-1.5">
            <SummaryRow
              label="Ingresos"
              amountMinor={summary.data.income_minor}
              currency={summary.data.currency}
            />
            <SummaryRow
              label="Gastos"
              amountMinor={summary.data.expenses_minor}
              currency={summary.data.currency}
            />
            <SummaryRow
              label="Ahorrado"
              amountMinor={summary.data.saved_minor}
              currency={summary.data.currency}
            />
            <SummaryRow
              label="Pagos de deuda"
              amountMinor={summary.data.debt_payments_minor}
              currency={summary.data.currency}
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
