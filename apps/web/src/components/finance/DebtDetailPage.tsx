"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { clientFetch } from "@/lib/api/client";

import { DebtCard, type Debt } from "./DebtCard";
import { DebtDetail } from "./DebtDetail";

/** A debt's own page: where it stands on top, payments and actions below. */
export function DebtDetailPage({ debtId }: { debtId: string }) {
  const router = useRouter();
  // Same key DebtDetail reads and refreshes after a payment, so the card on
  // top updates with it.
  const detail = useQuery({
    queryKey: ["debt-detail", debtId],
    queryFn: () => clientFetch<Debt>(`/me/debts/${debtId}`),
  });

  if (detail.isLoading) {
    return <div className="h-48 animate-pulse rounded-2xl bg-surface-sunken" />;
  }
  if (!detail.data) {
    return <p className="text-sm text-text-muted">No encontramos esta deuda.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <DebtCard debt={detail.data} />
      <DebtDetail debt={detail.data} onDeleted={() => router.push("/finanzas?tab=debts")} />
    </div>
  );
}
