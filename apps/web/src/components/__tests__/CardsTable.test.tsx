import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

import { CardsTable } from "../creditCards/CardsTable";
import type { CreditCard } from "@/lib/creditCards";

const statement = {
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
  payment_due_on: "2099-10-02",
};

const active: CreditCard = {
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

const fresh: CreditCard = {
  ...active,
  id: "c2",
  nickname: "Nueva sin extracto",
  outstanding_minor: 0,
  credit_used_ratio: 0,
  latest_statement: null,
};

const cancelled: CreditCard = {
  ...active,
  id: "c3",
  nickname: "Amex antigua",
  status: "cancelled",
  outstanding_minor: 0,
  credit_used_ratio: 0.5,
};

function renderTable(cards: CreditCard[]) {
  render(<CardsTable cards={cards} today="2026-09-30" />);
}

function rowOf(name: string) {
  return screen.getByRole("link", { name }).closest("tr") as HTMLElement;
}

afterEach(cleanup);

describe("CardsTable", () => {
  it("links each row to its card", () => {
    renderTable([active, fresh]);
    expect(screen.getByRole("link", { name: "Visa del día a día" })).toHaveAttribute(
      "href",
      "/finanzas/tarjetas/c1",
    );
    expect(screen.getByRole("link", { name: "Nueva sin extracto" })).toHaveAttribute(
      "href",
      "/finanzas/tarjetas/c2",
    );
  });

  it("has the minimum payment and used limit columns", () => {
    renderTable([active]);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(
      expect.arrayContaining(["Pago mínimo", "Cupo usado"]),
    );
    const row = within(rowOf("Visa del día a día"));
    expect(row.getByText(/184\.230/)).toBeInTheDocument();
    expect(row.getByRole("progressbar", { name: "Cupo usado 31%" })).toHaveAttribute(
      "aria-valuenow",
      "31",
    );
    expect(row.getByText("31 %")).toBeInTheDocument();
  });

  it("shows a dash instead of a minimum payment when nothing is owed", () => {
    renderTable([active, fresh, cancelled]);
    const freshRow = rowOf("Nueva sin extracto");
    expect(within(freshRow).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(within(rowOf("Amex antigua")).queryByText(/184\.230/)).not.toBeInTheDocument();
  });

  it("clamps the used limit bar to 0..100", () => {
    renderTable([
      { ...active, id: "over", nickname: "Sobregirada", credit_used_ratio: 1.4 },
      { ...active, id: "under", nickname: "Negativa", credit_used_ratio: -0.3 },
    ]);
    expect(
      within(rowOf("Sobregirada")).getByRole("progressbar"),
    ).toHaveAttribute("aria-valuenow", "100");
    expect(
      within(rowOf("Negativa")).getByRole("progressbar"),
    ).toHaveAttribute("aria-valuenow", "0");
  });

  it("does not draw a used limit bar for a cancelled card", () => {
    renderTable([cancelled]);
    expect(within(rowOf("Amex antigua")).queryByRole("progressbar")).toBeNull();
  });
});
