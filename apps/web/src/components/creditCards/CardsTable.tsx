"use client";

import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { DataTable } from "@/components/ui/DataTable";
import {
  cardStanding,
  cardStandingLook,
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
          header: "Fecha límite de pago",
          hideOnMobile: true,
          cell: (card) =>
            card.latest_statement && card.outstanding_minor > 0
              ? formatDayMonth(card.latest_statement.payment_due_on)
              : "—",
        },
      ]}
    />
  );
}
