"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { StatementsTab } from "@/components/creditCards/ActivityLists";
import { Button } from "@/components/ui/Button";
import { clientFetch } from "@/lib/api/client";
import type { CreditCardDetail } from "@/lib/creditCards";
import { todayLocal } from "@/lib/dates";

/** Full-page statement history; shares the detail query so it is usually warm. */
export function StatementsHistoryPage({ id }: { id: string }) {
  const card = useQuery({
    queryKey: ["credit-card", id],
    queryFn: () => clientFetch<CreditCardDetail>(`/me/credit-cards/${id}`),
  });

  if (card.isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />;
  }

  if (!card.data) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-text-muted">No pudimos cargar esta tarjeta.</p>
        <Button variant="secondary" onClick={() => void card.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <Link href={`/finanzas/tarjetas/${id}`} className="text-[0.8125rem] text-text-muted">
          ‹ {card.data.nickname}
        </Link>
        <h1 className="text-[1.375rem] font-bold tracking-tight">Extractos</h1>
        <span className="text-[0.8125rem] text-text-muted">
          Un extracto por corte. Ninguno cambia después de cerrar.
        </span>
      </div>
      <StatementsTab card={card.data} today={todayLocal()} />
    </div>
  );
}
