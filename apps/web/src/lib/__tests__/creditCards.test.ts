import { describe, expect, it } from "vitest";

import {
  NO_CARD_FILTERS,
  cardStanding,
  cardStatusCounts,
  filterCards,
  installmentsBilled,
  isBilled,
  selectedIndexFromScroll,
  type CreditCard,
  type CreditCardPurchase,
  type CreditCardStatement,
} from "../creditCards";

const statement: CreditCardStatement = {
  id: "s1",
  cycle_starts_on: "2026-08-16",
  cycle_ends_on: "2026-09-15",
  opening_balance_minor: 0,
  purchases_total_minor: 0,
  installments_due_minor: 0,
  interest_charged_minor: 0,
  payments_total_minor: 0,
  closing_balance_minor: 1_842_300,
  minimum_payment_minor: 184_230,
  payment_due_on: "2026-10-02",
};

const card: CreditCard = {
  id: "c1",
  nickname: "Visa del día a día",
  bank_label: "Bancolombia",
  credit_limit_minor: 8_000_000,
  interest_rate_monthly_pct: 1.89,
  minimum_payment_pct: 10,
  minimum_payment_floor_minor: 50_000,
  statement_cutoff_day: 15,
  payment_due_days: 17,
  status: "active",
  currency: "COP",
  outstanding_minor: 1_842_300,
  current_cycle_balance_minor: 624_900,
  credit_used_ratio: 0.31,
  latest_statement: statement,
};

describe("cardStanding", () => {
  it("is due soon within five days of the limit date", () => {
    expect(cardStanding(card, "2026-09-30")).toBe("due_soon");
    expect(cardStanding(card, "2026-09-27")).toBe("due_soon");
  });

  it("is up to date when the limit date is further than five days away", () => {
    expect(cardStanding(card, "2026-09-26")).toBe("up_to_date");
  });

  it("is overdue once the limit date passed with a balance", () => {
    expect(cardStanding(card, "2026-10-03")).toBe("overdue");
  });

  it("is up to date with nothing outstanding, even past the limit date", () => {
    expect(cardStanding({ ...card, outstanding_minor: 0 }, "2026-12-01")).toBe("up_to_date");
  });

  it("is up to date before any statement exists", () => {
    expect(cardStanding({ ...card, latest_statement: null }, "2026-09-30")).toBe("up_to_date");
  });

  it("is cancelled whatever else is true", () => {
    expect(cardStanding({ ...card, status: "cancelled" }, "2026-10-03")).toBe("cancelled");
  });
});

describe("filtering", () => {
  const cancelled: CreditCard = { ...card, id: "c2", status: "cancelled", outstanding_minor: 0 };
  const overdue: CreditCard = {
    ...card,
    id: "c3",
    nickname: "Viajes",
    latest_statement: { ...statement, payment_due_on: "2026-09-20" },
  };
  const all = [card, cancelled, overdue];

  it("counts every standing", () => {
    expect(cardStatusCounts(all, "2026-09-30")).toEqual({
      all: 3,
      active: 2,
      due_soon: 1,
      overdue: 1,
      cancelled: 1,
    });
  });

  it("shows active cards by default, nearest limit date first", () => {
    const ids = filterCards(all, NO_CARD_FILTERS, "2026-09-30").map((c) => c.id);
    expect(ids).toEqual(["c3", "c1"]);
  });

  it("sorts by outstanding balance, highest first", () => {
    const big = { ...card, id: "c4", outstanding_minor: 9_000_000 };
    const ids = filterCards([card, big], { status: "all", sort: "outstanding" }, "2026-09-30").map(
      (c) => c.id,
    );
    expect(ids).toEqual(["c4", "c1"]);
  });

  it("puts cards without a statement last when sorting by limit date", () => {
    const fresh = { ...card, id: "c5", latest_statement: null, outstanding_minor: 0 };
    const ids = filterCards([fresh, card], { status: "all", sort: "due" }, "2026-09-30").map(
      (c) => c.id,
    );
    expect(ids).toEqual(["c1", "c5"]);
  });
});

describe("isBilled", () => {
  it("treats the cutoff day itself as billed", () => {
    expect(isBilled("2026-09-15", statement)).toBe(true);
    expect(isBilled("2026-09-16", statement)).toBe(false);
  });

  it("treats everything as open before the first statement", () => {
    expect(isBilled("2020-01-01", null)).toBe(false);
  });
});

describe("installmentsBilled", () => {
  const purchase: CreditCardPurchase = {
    id: "p1",
    description: "Colchón",
    category_id: null,
    amount_minor: 1_080_000,
    purchased_on: "2026-06-12",
    installments_total: 6,
    installment_amount_minor: 180_000,
    first_installment_on: "2026-07-15",
  };

  it("counts installments scheduled on or before the latest cutoff", () => {
    expect(installmentsBilled(purchase, statement)).toBe(3);
  });

  it("never exceeds the plan length", () => {
    const late = { ...statement, cycle_ends_on: "2027-12-15" };
    expect(installmentsBilled(purchase, late)).toBe(6);
  });

  it("is zero before the first statement or for a single payment", () => {
    expect(installmentsBilled(purchase, null)).toBe(0);
    expect(installmentsBilled({ ...purchase, installments_total: null }, statement)).toBe(0);
  });
});

describe("selectedIndexFromScroll", () => {
  it("rounds to the nearest snapped tile", () => {
    expect(selectedIndexFromScroll(0, 300, 12, 3)).toBe(0);
    expect(selectedIndexFromScroll(300, 300, 12, 3)).toBe(1);
    expect(selectedIndexFromScroll(620, 300, 12, 3)).toBe(2);
  });

  it("never leaves the list", () => {
    expect(selectedIndexFromScroll(5000, 300, 12, 3)).toBe(2);
    expect(selectedIndexFromScroll(-40, 300, 12, 3)).toBe(0);
  });

  it("stays at zero for an empty list", () => {
    expect(selectedIndexFromScroll(0, 300, 12, 0)).toBe(0);
    expect(selectedIndexFromScroll(600, 300, 12, 0)).toBe(0);
  });
});
