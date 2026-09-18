"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { TransactionsTable } from "@/components/finance/tables";
import { TransactionRow, type Transaction } from "@/components/finance/TransactionRow";
import { PAYMENT_METHOD_LABEL } from "@/components/finance/TransactionForm";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ActiveFilters,
  FilterButton,
  FilterChip,
  FilterSection,
  SearchField,
} from "@/components/ui/filters";
import { IconFileText, IconSearch } from "@/components/ui/Icons";
import { Sheet } from "@/components/ui/Sheet";
import { clientFetch } from "@/lib/api/client";
import {
  NO_TRANSACTION_FILTERS,
  filterTransactions,
  hiddenFilterCount,
  type TransactionFilters,
} from "@/lib/financeFilters";
import { currentMonth, monthLabel } from "@/lib/months";
import { useViewMode } from "@/lib/viewMode";

function methodLabel(method: string): string {
  return PAYMENT_METHOD_LABEL[method as keyof typeof PAYMENT_METHOD_LABEL] ?? method;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** One month of income or expenses, with search and filters on top. */
export function TransactionsPanel({
  kind,
  month,
  onCreate,
}: {
  kind: "income" | "expense";
  month: string;
  onCreate: () => void;
}) {
  const asTable = useViewMode() === "table";
  const [filters, setFilters] = useState<TransactionFilters>(NO_TRANSACTION_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const query = useQuery({
    queryKey: ["transactions", kind, month],
    queryFn: () =>
      clientFetch<{ items: Transaction[]; next_cursor: string | null }>(
        `/me/transactions?kind=${kind}&period=${month}&limit=200`,
      ),
    select: (data) => data.items,
  });

  const all = query.data ?? [];
  const visible = filterTransactions(all, filters);
  // Only what this month actually has: a filter that can only return nothing
  // is noise.
  const categories = [
    ...new Map(all.flatMap((t) => t.categories).map((c) => [c.id, c])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const methods = [...new Set(all.map((t) => t.payment_method))];
  const filtering = filters.query.trim() !== "" || hiddenFilterCount(filters) > 0;
  const noun = kind === "income" ? "ingresos" : "gastos";

  const clear = () => setFilters(NO_TRANSACTION_FILTERS);
  const activeChips = [
    ...filters.categoryIds.map((id) => ({
      key: `c-${id}`,
      label: categories.find((c) => c.id === id)?.name ?? "Categoría",
      onRemove: () => setFilters({ ...filters, categoryIds: toggle(filters.categoryIds, id) }),
    })),
    ...filters.methods.map((method) => ({
      key: `m-${method}`,
      label: methodLabel(method),
      onRemove: () => setFilters({ ...filters, methods: toggle(filters.methods, method) }),
    })),
  ];

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-2.5" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-surface-sunken" />
        ))}
      </div>
    );
  }

  if (!all.length) {
    return (
      <EmptyState
        icon={<IconFileText />}
        message={
          month === currentMonth()
            ? `Anota lo que ${kind === "income" ? "recibiste" : "gastaste"} y lo verás aquí con su fecha.`
            : `No hay ${noun} en ${monthLabel(month).toLowerCase()}.`
        }
        action={
          <Button onClick={onCreate}>
            {kind === "income" ? "Registrar un ingreso" : "Registrar un gasto"}
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SearchField
          value={filters.query}
          onChange={(query) => setFilters({ ...filters, query })}
          placeholder={`Buscar en ${noun}`}
        />
        <FilterButton count={hiddenFilterCount(filters)} onClick={() => setSheetOpen(true)} />
      </div>

      <ActiveFilters items={activeChips} onClear={clear} />

      {filtering ? (
        <p className="text-xs text-text-muted" aria-live="polite">
          {visible.length} de {all.length} movimientos
        </p>
      ) : null}

      {!visible.length ? (
        <EmptyState
          icon={<IconSearch />}
          message="Ningún movimiento coincide con los filtros."
          action={
            <Button variant="secondary" onClick={clear}>
              Limpiar filtros
            </Button>
          }
        />
      ) : asTable ? (
        <TransactionsTable kind={kind} transactions={visible} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visible.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      )}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filtros">
        <div className="flex flex-col gap-6 pb-2">
          <FilterSection title="Categoría">
            {categories.map((category) => (
              <FilterChip
                key={category.id}
                selected={filters.categoryIds.includes(category.id)}
                onClick={() =>
                  setFilters({ ...filters, categoryIds: toggle(filters.categoryIds, category.id) })
                }
              >
                {category.name}
              </FilterChip>
            ))}
          </FilterSection>
          <FilterSection title="Método de pago">
            {methods.map((method) => (
              <FilterChip
                key={method}
                selected={filters.methods.includes(method)}
                onClick={() => setFilters({ ...filters, methods: toggle(filters.methods, method) })}
              >
                {methodLabel(method)}
              </FilterChip>
            ))}
          </FilterSection>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => setFilters({ ...filters, categoryIds: [], methods: [] })}
            >
              Limpiar
            </Button>
            <Button onClick={() => setSheetOpen(false)}>
              Ver {visible.length} {visible.length === 1 ? "resultado" : "resultados"}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
