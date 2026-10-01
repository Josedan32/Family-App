"use client";

import Link from "next/link";
import { useState } from "react";

import { CardCarousel } from "@/components/creditCards/CardCarousel";
import { StatementSummary } from "@/components/creditCards/StatementSummary";
import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { VisibilityBadge } from "@/components/privacy/VisibilityBadge";
import { Card } from "@/components/ui/Card";
import { IconLock } from "@/components/ui/Icons";
import type { CreditCard, CreditCardSummary } from "@/lib/creditCards";

export type MemberCardsProps = { memberId: string; memberName: string } & (
  | { state: "detail"; cards: CreditCard[]; today: string }
  | { state: "summary"; summary: CreditCardSummary }
  | { state: "private" }
);

export type MemberCardsState =
  | { state: "detail"; cards: CreditCard[] }
  | { state: "summary"; summary: CreditCardSummary }
  | { state: "private" };

/** `null` is a denial; the body's shape says which of the other two was granted. */
export function toMemberCardsState(
  result: CreditCard[] | CreditCardSummary | null,
): MemberCardsState {
  if (result === null) return { state: "private" };
  if (Array.isArray(result)) return { state: "detail", cards: result };
  return { state: "summary", summary: result };
}

function ReadOnlyCards({
  memberName,
  cards,
  today,
}: {
  memberName: string;
  cards: CreditCard[];
  today: string;
}) {
  const [selectedId, setSelectedId] = useState(cards[0]?.id ?? "");

  if (cards.length === 0) {
    return <p className="text-sm text-text-muted">{memberName} no tiene tarjetas registradas.</p>;
  }

  const selected = cards.find((card) => card.id === selectedId) ?? cards[0];
  return (
    <div className="flex flex-col gap-3.5">
      <CardCarousel cards={cards} today={today} selectedId={selected.id} onSelect={setSelectedId} />
      {selected.latest_statement ? (
        <StatementSummary
          statement={selected.latest_statement}
          currency={selected.currency}
          today={today}
        />
      ) : null}
      <p className="text-[0.8125rem] text-text-muted">
        Solo lectura. {memberName} comparte esta sección.
      </p>
    </div>
  );
}

function SummaryTotal({ memberName, summary }: { memberName: string; summary: CreditCardSummary }) {
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-1.5 p-[1.125rem]">
        <span className="text-[0.8125rem] text-text-muted">
          Saldo pendiente de todas sus tarjetas
        </span>
        <MoneyDisplay
          amountMinor={summary.total_outstanding_minor}
          currency={summary.currency}
          className="text-[2.5rem] font-bold leading-[1.05] tracking-tight"
        />
      </Card>
      <p className="text-sm text-text-muted">
        {memberName} comparte solo el total. No ves tarjetas, compras, pagos ni extractos.
      </p>
    </div>
  );
}

function LockedPanel({ memberName }: { memberName: string }) {
  return (
    <div
      role="note"
      className="flex flex-col items-center gap-2.5 rounded-xl border border-border bg-surface-sunken px-[1.125rem] py-6 text-center"
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-private"
      >
        <IconLock width={20} height={20} />
      </span>
      <span className="font-semibold">Privado</span>
      <span className="max-w-[17rem] text-sm text-text-muted">
        {memberName} no comparte esta sección.
      </span>
    </div>
  );
}

export function MemberCards(props: MemberCardsProps) {
  const { memberId, memberName } = props;
  const level = props.state === "detail" ? "public" : props.state;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col">
          <Link href={`/hogar/miembros/${memberId}`} className="text-[0.8125rem] text-text-muted">
            ‹ {memberName}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Tarjetas de crédito</h1>
        </div>
        <VisibilityBadge level={level} />
      </div>
      {props.state === "detail" ? (
        <ReadOnlyCards memberName={memberName} cards={props.cards} today={props.today} />
      ) : props.state === "summary" ? (
        <SummaryTotal memberName={memberName} summary={props.summary} />
      ) : (
        <LockedPanel memberName={memberName} />
      )}
    </div>
  );
}
