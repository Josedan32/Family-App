"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { CardCarousel } from "@/components/creditCards/CardCarousel";
import { CardForm } from "@/components/creditCards/CardForm";
import { CardsTable } from "@/components/creditCards/CardsTable";
import {
  OpenCycleBox,
  OutstandingBox,
} from "@/components/creditCards/BalanceBoxes";
import { PurchaseForm } from "@/components/creditCards/PurchaseForm";
import { PaymentForm } from "@/components/creditCards/PaymentForm";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChipChoice } from "@/components/ui/filters";
import { Sheet } from "@/components/ui/Sheet";
import { clientFetch } from "@/lib/api/client";
import {
  NO_CARD_FILTERS,
  cardStatusCounts,
  filterCards,
  type CardFilters,
  type CreditCard,
} from "@/lib/creditCards";
import { todayLocal } from "@/lib/dates";
import { setViewMode, useViewMode } from "@/lib/viewMode";

export function CardsPanel() {
  const today = todayLocal();
  const asTable = useViewMode() === "table";
  const [filters, setFilters] = useState<CardFilters>(NO_CARD_FILTERS);
  const [selectedId, setSelectedId] = useState("");
  const [sheet, setSheet] = useState<"new" | "purchase" | "payment" | null>(
    null,
  );
  const cards = useQuery({
    queryKey: ["credit-cards"],
    queryFn: () => clientFetch<CreditCard[]>("/me/credit-cards"),
  });

  const all = cards.data ?? [];
  const visible = filterCards(all, filters, today);
  const selected = visible.find((card) => card.id === selectedId) ?? visible[0];

  if (cards.isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />;
  }

  if (!all.length) {
    return (
      <>
        <EmptyState
          icon={
            <span className="block h-[22px] w-8 rounded-[5px] border-2 border-t-[6px] border-text-muted" />
          }
          message="Aún no tienes tarjetas"
          action={
            <>
              <p className="max-w-[17rem] text-[0.9375rem] text-text-muted">
                Regístrala con su día de corte y verás el saldo pendiente, el
                ciclo abierto y la fecha límite de pago.
              </p>
              <Button onClick={() => setSheet("new")}>
                Registra tu primera tarjeta
              </Button>
            </>
          }
        />
        <Sheet
          open={sheet === "new"}
          onClose={() => setSheet(null)}
          title="Nueva tarjeta de crédito"
        >
          <CardForm onDone={() => setSheet(null)} />
        </Sheet>
      </>
    );
  }

  const counts = cardStatusCounts(all, today);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <button
          aria-label={asTable ? "Ver como tarjetas" : "Ver como tabla"}
          onClick={() => setViewMode(asTable ? "cards" : "table")}
          className="rounded-full border border-border bg-surface text-text-muted"
        >
          ☰
        </button>
        <button
          aria-label="Nueva tarjeta"
          onClick={() => setSheet("new")}
          className="rounded-full bg-brand text-2xl text-brand-contrast active:bg-brand-pressed"
        >
          +
        </button>
      </div>

      <ChipChoice
        label="Estado de la tarjeta"
        value={filters.status}
        onChange={(status) => setFilters({ ...filters, status })}
        options={[
          { value: "all", label: "Todas", count: counts.all },
          { value: "active", label: "Activas", count: counts.active },
          { value: "due_soon", label: "Vence pronto", count: counts.due_soon },
          { value: "overdue", label: "En mora", count: counts.overdue },
          { value: "cancelled", label: "Canceladas", count: counts.cancelled },
        ]}
      />

      {!visible.length ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-muted">
          Ninguna tarjeta coincide con el filtro.
        </p>
      ) : asTable ? (
        <CardsTable cards={visible} today={today} />
      ) : selected ? (
        <>
          <CardCarousel
            cards={visible}
            today={today}
            selectedId={selected.id}
            onSelect={setSelectedId}
          />
          <OutstandingBox card={selected} today={today} />
          <OpenCycleBox card={selected} />
          {selected.status !== "cancelled" ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setSheet("purchase")}>
                Registrar compra
              </Button>
              <Button onClick={() => setSheet("payment")}>
                Registrar pago
              </Button>
            </div>
          ) : null}
          <Link
            href={`/finanzas/tarjetas/${selected.id}`}
            className="flex min-h-11 items-center justify-center text-sm font-semibold text-brand"
          >
            Ver extracto y movimientos ›
          </Link>
        </>
      ) : null}

      <Sheet
        open={sheet === "new"}
        onClose={() => setSheet(null)}
        title="Nueva tarjeta de crédito"
      >
        <CardForm onDone={() => setSheet(null)} />
      </Sheet>
      {selected ? (
        <>
          <Sheet
            open={sheet === "purchase"}
            onClose={() => setSheet(null)}
            title="Registrar compra"
          >
            <PurchaseForm card={selected} onDone={() => setSheet(null)} />
          </Sheet>
          <Sheet
            open={sheet === "payment"}
            onClose={() => setSheet(null)}
            title="Registrar pago"
          >
            <PaymentForm card={selected} onDone={() => setSheet(null)} />
          </Sheet>
        </>
      ) : null}
    </div>
  );
}
