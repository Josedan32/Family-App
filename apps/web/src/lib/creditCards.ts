import type { components } from "@/lib/api/generated/schema";

import { addMonths, daysBetween } from "./dates";

type Schemas = components["schemas"];
export type CreditCard = Schemas["CreditCardResponse"];
export type CreditCardDetail = Schemas["CreditCardDetailResponse"];
export type CreditCardStatement = Schemas["CreditCardStatementResponse"];
export type CreditCardPurchase = Schemas["CreditCardPurchaseResponse"];
export type CreditCardPayment = Schemas["CreditCardPaymentResponse"];
export type CreditCardSummary = Schemas["CreditCardSummaryResponse"];

export type CardStanding = "cancelled" | "overdue" | "due_soon" | "up_to_date";

/** The design proposes five days; change it here only. */
export const DUE_SOON_DAYS = 5;

/** Standing comes from the latest statement's limit date and whether a balance
 *  is left. Nothing about it is stored. */
export function cardStanding(card: CreditCard, today: string): CardStanding {
  if (card.status === "cancelled") return "cancelled";
  if (card.outstanding_minor === 0 || !card.latest_statement) return "up_to_date";
  const days = daysBetween(today, card.latest_statement.payment_due_on);
  if (days < 0) return "overdue";
  if (days <= DUE_SOON_DAYS) return "due_soon";
  return "up_to_date";
}

interface StandingLook {
  label: string;
  /** Always paired with the label: colour never stands alone. */
  glyph: string;
  pill: string;
  tint: string;
  edge: string;
  /** Text colour class for the limit-date line. */
  text: string;
}

const wash = (token: string, percent: number) =>
  `color-mix(in srgb, var(${token}) ${percent}%, var(--surface))`;

const LOOK: Record<CardStanding, StandingLook> = {
  up_to_date: {
    label: "Al día",
    glyph: "✓",
    pill: "border-success text-success",
    tint: wash("--success", 8),
    edge: "var(--success)",
    text: "text-text-muted",
  },
  due_soon: {
    label: "Vence pronto",
    glyph: "◔",
    pill: "border-warning text-warning",
    tint: wash("--warning", 9),
    edge: "var(--warning)",
    text: "text-warning",
  },
  overdue: {
    label: "En mora",
    glyph: "!",
    pill: "border-danger text-danger",
    tint: wash("--danger", 9),
    edge: "var(--danger)",
    text: "text-danger",
  },
  cancelled: {
    label: "Cancelada",
    glyph: "✕",
    pill: "border-border text-text-muted",
    tint: "var(--surface-sunken)",
    edge: "var(--border)",
    text: "text-text-muted",
  },
};

export function cardStandingLook(standing: CardStanding): StandingLook {
  return LOOK[standing];
}

export type CardStatusFilter = "all" | "active" | "due_soon" | "overdue" | "cancelled";
export type CardSort = "due" | "outstanding" | "name";
export interface CardFilters {
  status: CardStatusFilter;
  sort: CardSort;
}

export const NO_CARD_FILTERS: CardFilters = { status: "active", sort: "due" };

export function cardStatusCounts(cards: CreditCard[], today: string) {
  const counts = { all: cards.length, active: 0, due_soon: 0, overdue: 0, cancelled: 0 };
  for (const card of cards) {
    const standing = cardStanding(card, today);
    if (standing === "cancelled") counts.cancelled += 1;
    else counts.active += 1;
    if (standing === "due_soon") counts.due_soon += 1;
    if (standing === "overdue") counts.overdue += 1;
  }
  return counts;
}

function matchesStatus(standing: CardStanding, status: CardStatusFilter): boolean {
  if (status === "all") return true;
  if (status === "active") return standing !== "cancelled";
  return standing === status;
}

export function filterCards(cards: CreditCard[], filters: CardFilters, today: string): CreditCard[] {
  const kept = cards.filter((card) => matchesStatus(cardStanding(card, today), filters.status));
  const due = (card: CreditCard) => card.latest_statement?.payment_due_on ?? "9999-12-31";
  return [...kept].sort((a, b) => {
    if (filters.sort === "outstanding") return b.outstanding_minor - a.outstanding_minor;
    if (filters.sort === "name") return a.nickname.localeCompare(b.nickname, "es");
    return due(a).localeCompare(due(b));
  });
}

/** A purchase or payment dated on or before the latest cutoff sits inside a
 *  closed statement and can no longer be deleted. ISO dates compare as text. */
export function isBilled(entryDate: string, statement: CreditCardStatement | null): boolean {
  return statement !== null && entryDate <= statement.cycle_ends_on;
}

/** Installments already billed: derived from the plan and the latest cutoff,
 *  never stored. Installment i falls due on `first_installment_on + i months`
 *  and lands in the cycle containing that date. */
export function installmentsBilled(
  purchase: CreditCardPurchase,
  statement: CreditCardStatement | null,
): number {
  if (!statement || !purchase.installments_total || !purchase.first_installment_on) return 0;
  let billed = 0;
  for (let i = 0; i < purchase.installments_total; i += 1) {
    if (addMonths(purchase.first_installment_on, i) <= statement.cycle_ends_on) billed += 1;
  }
  return billed;
}

/** Which tile a snap-scrolling carousel is centred on. */
export function selectedIndexFromScroll(
  scrollLeft: number,
  itemWidth: number,
  gap: number,
  count: number,
): number {
  const raw = Math.round(scrollLeft / (itemWidth + gap));
  return Math.min(Math.max(raw, 0), Math.max(count - 1, 0));
}
