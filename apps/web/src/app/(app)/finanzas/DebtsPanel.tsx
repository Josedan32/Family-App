"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { DebtCard, type Debt } from "@/components/finance/DebtCard";
import { DebtsTable } from "@/components/finance/tables";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ActiveFilters,
  ChipChoice,
  FilterButton,
  FilterChip,
  FilterSection,
} from "@/components/ui/filters";
import { IconCircleFilled } from "@/components/ui/Icons";
import { Sheet } from "@/components/ui/Sheet";
import { clientFetch } from "@/lib/api/client";
import {
  NO_DEBT_FILTERS,
  debtCreditors,
  debtStatusCounts,
  filterDebts,
  type DebtFilters,
  type DebtSort,
} from "@/lib/financeFilters";
import { useViewMode } from "@/lib/viewMode";

const SORT_LABEL: Record<DebtSort, string> = {
  due: "Próximo pago",
  outstanding: "Mayor saldo",
  name: "Nombre",
};

export function DebtsPanel({ onCreate }: { onCreate: () => void }) {
  const asTable = useViewMode() === "table";
  const [filters, setFilters] = useState<DebtFilters>(NO_DEBT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const debts = useQuery({
    queryKey: ["debts"],
    queryFn: () => clientFetch<Debt[]>("/me/debts"),
  });

  if (debts.isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />;
  }

  const all = debts.data ?? [];
  if (!all.length) {
    return (
      <EmptyState
        icon={<IconCircleFilled />}
        message="Registra lo que debes para llevar el saldo pendiente."
        action={<Button onClick={onCreate}>Registrar una deuda</Button>}
      />
    );
  }

  const counts = debtStatusCounts(all);
  const creditors = debtCreditors(all);
  const visible = filterDebts(all, filters);
  const toggleCreditor = (creditor: string) =>
    setFilters({
      ...filters,
      creditors: filters.creditors.includes(creditor)
        ? filters.creditors.filter((c) => c !== creditor)
        : [...filters.creditors, creditor],
    });

  return (
    <div className="flex flex-col gap-3">
      <ChipChoice
        label="Estado de la deuda"
        value={filters.status}
        onChange={(status) => setFilters({ ...filters, status })}
        options={[
          { value: "all", label: "Todas", count: counts.all },
          { value: "active", label: "Activas", count: counts.active },
          { value: "overdue", label: "En mora", count: counts.overdue },
          { value: "paid", label: "Pagadas", count: counts.paid },
        ]}
      />

      <div className="flex items-center gap-2">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm">
          <span className="whitespace-nowrap text-text-muted">Ordenar por</span>
          <select
            value={filters.sort}
            onChange={(event) => setFilters({ ...filters, sort: event.target.value as DebtSort })}
            className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
          >
            {Object.entries(SORT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {creditors.length > 1 ? (
          <FilterButton count={filters.creditors.length} onClick={() => setSheetOpen(true)} />
        ) : null}
      </div>

      <ActiveFilters
        items={filters.creditors.map((creditor) => ({
          key: creditor,
          label: creditor,
          onRemove: () => toggleCreditor(creditor),
        }))}
        onClear={() => setFilters({ ...filters, creditors: [] })}
      />

      {!visible.length ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-muted">
          {filters.status === "overdue" && !filters.creditors.length
            ? "Ninguna deuda en mora. Vas al día."
            : "Ninguna deuda coincide con los filtros."}
        </p>
      ) : asTable ? (
        <DebtsTable debts={visible} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((debt) => (
            <Link key={debt.id} href={`/finanzas/deudas/${debt.id}`} className="block">
              <DebtCard debt={debt} />
            </Link>
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filtros">
        <div className="flex flex-col gap-6 pb-2">
          <FilterSection title="Acreedor">
            {creditors.map((creditor) => (
              <FilterChip
                key={creditor}
                selected={filters.creditors.includes(creditor)}
                onClick={() => toggleCreditor(creditor)}
              >
                {creditor}
              </FilterChip>
            ))}
          </FilterSection>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setFilters({ ...filters, creditors: [] })}>
              Limpiar
            </Button>
            <Button onClick={() => setSheetOpen(false)}>
              Ver {visible.length} {visible.length === 1 ? "deuda" : "deudas"}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
