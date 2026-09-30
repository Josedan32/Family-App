import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const clientFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  clientFetch: (...args: unknown[]) => clientFetch(...args),
}));

import { StatementsHistoryPage } from "@/app/(app)/finanzas/tarjetas/StatementsHistoryPage";
import type { CreditCardDetail, CreditCardStatement } from "@/lib/creditCards";

const statement: CreditCardStatement = {
  id: "s-sep",
  cycle_starts_on: "2026-08-16",
  cycle_ends_on: "2026-09-15",
  opening_balance_minor: 1_120_000,
  purchases_total_minor: 905_400,
  installments_due_minor: 180_000,
  interest_charged_minor: 36_900,
  payments_total_minor: 400_000,
  closing_balance_minor: 1_842_300,
  minimum_payment_minor: 184_230,
  payment_due_on: "2099-10-02",
};

const detail: CreditCardDetail = {
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
  current_cycle_balance_minor: 0,
  credit_used_ratio: 0.31,
  latest_statement: statement,
  purchases: [],
  payments: [],
  statements: [statement, { ...statement, id: "s-aug", cycle_starts_on: "2026-07-16", cycle_ends_on: "2026-08-15" }],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StatementsHistoryPage id="c1" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  clientFetch.mockReset();
});

describe("StatementsHistoryPage", () => {
  it("lists every statement and links back to the card", async () => {
    clientFetch.mockResolvedValue(detail);
    renderPage();
    expect(await screen.findByRole("heading", { name: "Extractos" })).toBeInTheDocument();
    expect(screen.getByText(/16 ago – 15 sep 2026/)).toBeInTheDocument();
    expect(screen.getByText(/16 jul – 15 ago 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Visa del día a día/ })).toHaveAttribute(
      "href",
      "/finanzas/tarjetas/c1",
    );
  });

  it("offers a retry when the card cannot be loaded", async () => {
    clientFetch.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
