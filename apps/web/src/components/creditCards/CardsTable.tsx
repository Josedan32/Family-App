"use client";

import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { DataTable } from "@/components/ui/DataTable";
import {
  cardStanding,
  cardStandingLook,
  usedLimitPercent,
  type CreditCard,
} from "@/lib/creditCards";
import { formatDayMonth } from "@/lib/dates";

export function CardsTable({
  cards,
  today,
}: {
  cards: CreditCard[];
  today: string;
}) {
  return (
    <DataTable
      caption="Tarjetas de crédito"
      rows={cards}
      rowKey={(card) => card.id}
      rowHref={(card) => `/finanzas/tarjetas/${card.id}`}
      mobileDetail={(card) => card.bank_label}
      columns={[
        { header: "Tarjeta", cell: (card) => card.nickname },
        {
          header: "Estado",
          cell: (card) => {
            const look = cardStandingLook(cardStanding(card, today));
            return (
              <span
                className={`rounded-full border bg-surface px-2 py-0.5 text-[0.6875rem] font-bold ${look.pill}`}
              >
                <span aria-hidden="true">{look.glyph} </span>
                {look.label}
              </span>
            );
          },
        },
        {
          header: "Saldo pendiente",
          align: "end",
          nowrap: true,
          cell: (card) => (
            <MoneyDisplay
              amountMinor={card.outstanding_minor}
              currency={card.currency}
              className="font-bold"
            />
          ),
        },
        {
          header: "Ciclo abierto",
          hideOnMobile: true,
          align: "end",
          nowrap: true,
          cell: (card) => (
            <MoneyDisplay
              amountMinor={card.current_cycle_balance_minor}
              currency={card.currency}
              className="text-text-muted"
            />
          ),
        },
        {
          header: "Pago mínimo",
          hideOnMobile: true,
          align: "end",
          nowrap: true,
          cell: (card) =>
            card.latest_statement && card.outstanding_minor > 0 ? (
              <MoneyDisplay
                amountMinor={card.latest_statement.minimum_payment_minor}
                currency={card.currency}
              />
            ) : (
              <span className="text-text-muted">—</span>
            ),
        },
        {
          header: "Fecha límite de pago",
          hideOnMobile: true,
          cell: (card) =>
            card.latest_statement && card.outstanding_minor > 0
              ? formatDayMonth(card.latest_statement.payment_due_on)
              : "—",
        },
        {
          header: "Cupo usado",
          hideOnMobile: true,
          cell: (card) => {
            if (card.status === "cancelled") {
              return <span className="text-text-muted">—</span>;
            }
            const percent = usedLimitPercent(card.credit_used_ratio);
            const look = cardStandingLook(cardStanding(card, today));
            return (
              <span className="flex items-center gap-2">
                <span
                  role="progressbar"
                  aria-label={`Cupo usado ${percent}%`}
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-border"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${percent}%`, backgroundColor: look.edge }}
                  />
                </span>
                <span className="whitespace-nowrap text-[0.8125rem] text-text-muted">
                  {percent} %
                </span>
              </span>
            );
          },
        },
      ]}
    />
  );
}
