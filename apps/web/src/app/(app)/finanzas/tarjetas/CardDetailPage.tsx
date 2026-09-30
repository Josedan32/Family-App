"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import {
  PaymentsTab,
  PurchasesTab,
  StatementsTab,
} from "@/components/creditCards/ActivityLists";
import { BilledSheet } from "@/components/creditCards/BilledSheet";
import { PaymentForm } from "@/components/creditCards/PaymentForm";
import { PurchaseForm } from "@/components/creditCards/PurchaseForm";
import { StatementSummary } from "@/components/creditCards/StatementSummary";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Tabs } from "@/components/ui/Tabs";
import { clientFetch } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import {
  cardStanding,
  cardStandingLook,
  type CreditCardDetail,
} from "@/lib/creditCards";
import { formatDayMonthYear, todayLocal } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { pushToast } from "@/lib/toast";

const TABS = [
  { id: "purchases", label: "Compras" },
  { id: "payments", label: "Pagos" },
  { id: "statements", label: "Extractos" },
] as const;

type TabId = (typeof TABS)[number]["id"];
type Billed = {
  kind: "purchase" | "payment";
  entry: { title: string; detail: string; amountMinor: number };
};

export function CardDetailPage({ id }: { id: string }) {
  const today = todayLocal();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("purchases");
  const [sheet, setSheet] = useState<"purchase" | "payment" | null>(null);
  const [billed, setBilled] = useState<Billed | null>(null);

  const card = useQuery({
    queryKey: ["credit-card", id],
    queryFn: () => clientFetch<CreditCardDetail>(`/me/credit-cards/${id}`),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["credit-card", id] });
    await queryClient.invalidateQueries({ queryKey: ["credit-cards"] });
  };

  const removePurchase = useMutation({
    mutationFn: (purchaseId: string) =>
      clientFetch(
        `/me/credit-cards/${id}/purchases/${purchaseId}`,
        { method: "DELETE" },
        { quietOn: ["purchase_already_billed"] },
      ),
    onSuccess: async () => {
      await invalidate();
      pushToast({ message: "Compra borrada", type: "success" });
    },
    onError: (error, purchaseId) => {
      const purchase = card.data?.purchases.find((p) => p.id === purchaseId);
      if (purchase && error instanceof ApiError && error.type === "purchase_already_billed") {
        setBilled({
          kind: "purchase",
          entry: {
            title: purchase.description,
            detail: formatDayMonthYear(purchase.purchased_on),
            amountMinor: purchase.amount_minor,
          },
        });
      }
    },
  });

  const removePayment = useMutation({
    mutationFn: (paymentId: string) =>
      clientFetch(
        `/me/credit-cards/${id}/payments/${paymentId}`,
        { method: "DELETE" },
        { quietOn: ["payment_already_billed"] },
      ),
    onSuccess: async () => {
      await invalidate();
      pushToast({ message: "Pago borrado", type: "success" });
    },
    onError: (error, paymentId) => {
      const payment = card.data?.payments.find((p) => p.id === paymentId);
      if (payment && error instanceof ApiError && error.type === "payment_already_billed") {
        setBilled({
          kind: "payment",
          entry: {
            title: "Pago",
            detail: formatDayMonthYear(payment.paid_on),
            amountMinor: payment.amount_minor,
          },
        });
      }
    },
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

  const data = card.data;
  const editable = data.status !== "cancelled";
  const look = cardStandingLook(cardStanding(data, today));
  const closeSheet = () => setSheet(null);
  const listProps = { card: data, today, editable };

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <Link href="/finanzas/tarjetas" className="text-[0.8125rem] text-text-muted">
            ‹ Tarjetas
          </Link>
          <h1 className="text-[1.375rem] font-bold tracking-tight">{data.nickname}</h1>
          <span className="text-[0.8125rem] text-text-muted">
            {data.bank_label} · corte el {data.statement_cutoff_day} · cupo{" "}
            {formatMoney(data.credit_limit_minor, data.currency)}
          </span>
        </div>
        <span
          className={`mt-5 inline-flex flex-none items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold ${look.pill}`}
        >
          <span aria-hidden="true">{look.glyph}</span>
          {look.label}
        </span>
      </div>

      {data.latest_statement ? (
        <StatementSummary
          statement={data.latest_statement}
          currency={data.currency}
          today={today}
        />
      ) : null}

      <Tabs tabs={TABS} active={tab} onChange={(next) => setTab(next as TabId)} />

      <div role="tabpanel">
        {tab === "purchases" ? (
          <PurchasesTab {...listProps} onDelete={(pid) => removePurchase.mutate(pid)} />
        ) : tab === "payments" ? (
          <PaymentsTab {...listProps} onDelete={(pid) => removePayment.mutate(pid)} />
        ) : (
          <StatementsTab card={data} today={today} />
        )}
      </div>

      {editable ? (
        <div className="sticky bottom-0 -mx-1 grid grid-cols-2 gap-2 bg-bg px-1 py-3">
          <Button variant="secondary" onClick={() => setSheet("purchase")}>
            Registrar compra
          </Button>
          <Button onClick={() => setSheet("payment")}>Registrar pago</Button>
        </div>
      ) : null}

      {sheet === "purchase" ? (
        <Sheet open onClose={closeSheet} title="Registrar compra">
          <PurchaseForm card={data} onDone={closeSheet} />
        </Sheet>
      ) : null}
      {sheet === "payment" ? (
        <Sheet open onClose={closeSheet} title="Registrar pago">
          <PaymentForm card={data} onDone={closeSheet} />
        </Sheet>
      ) : null}

      {billed && data.latest_statement ? (
        <BilledSheet
          open
          kind={billed.kind}
          entry={billed.entry}
          statement={data.latest_statement}
          currency={data.currency}
          onClose={() => setBilled(null)}
          onViewStatement={() => {
            setTab("statements");
            setBilled(null);
          }}
        />
      ) : null}
    </div>
  );
}
