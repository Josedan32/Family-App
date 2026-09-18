import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import type { Debt } from "../finance/DebtCard";
import type { Goal } from "../finance/GoalCard";
import type { HouseholdExpense } from "../finance/HouseholdExpenseRow";
import type { Transaction } from "../finance/TransactionRow";
import {
  DebtsTable,
  GoalsTable,
  HouseholdExpensesTable,
  TransactionsTable,
} from "../finance/tables";

const expense: Transaction = {
  id: "t1",
  kind: "expense",
  categories: [{ id: "c1", name: "Comida" }],
  amount_minor: 80_000,
  currency: "COP",
  occurred_on: "2026-09-12",
  name: "Mercado",
  note: null,
  source: "manual",
  is_recurring: false,
  frequency: null,
  payment_method: "nequi",
};

function withClient(ui: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe("TransactionsTable", () => {
  it("shows date, detail, payment method and amount per row", () => {
    withClient(<TransactionsTable kind="expense" transactions={[expense]} />);
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getByText("12 sep 2026")).toBeInTheDocument();
    expect(within(row).getByText("Mercado")).toBeInTheDocument();
    expect(within(row).getByText("Nequi")).toBeInTheDocument();
  });

  it("marks a derived row with where it comes from", () => {
    withClient(
      <TransactionsTable
        kind="income"
        transactions={[{ ...expense, kind: "income", name: null, source: "savings_withdrawal" }]}
      />,
    );
    expect(screen.getByText("Retiro de ahorro")).toBeInTheDocument();
  });

  it("opens the movement's own page from its row", () => {
    withClient(<TransactionsTable kind="expense" transactions={[expense]} />);
    expect(screen.getByRole("link", { name: "Mercado" })).toHaveAttribute(
      "href",
      "/finanzas/movimientos/t1",
    );
  });

  it("keeps only name and amount as columns on a phone", () => {
    withClient(<TransactionsTable kind="expense" transactions={[expense]} />);
    const visible = screen
      .getAllByRole("columnheader")
      .filter((header) => !header.classList.contains("hidden"))
      .map((header) => header.textContent);
    expect(visible).toEqual(["Detalle", "Monto"]);
  });
});

describe("GoalsTable", () => {
  const goal: Goal = {
    id: "g1",
    name: "Pasaporte",
    target_amount_minor: 300_000,
    balance_minor: 300_000,
    progress: 1,
    currency: "COP",
    priority: "alta",
    target_date: null,
    days_remaining: null,
    is_overdue: false,
    state: "usada",
    used_on: "2026-08-20",
  };

  it("shows each goal's state in words", () => {
    withClient(<GoalsTable goals={[goal, { ...goal, id: "g2", name: "Moto", state: "en_progreso", used_on: null, progress: 0.2 }]} />);
    expect(screen.getByText("Usada")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
  });
});

describe("HouseholdExpensesTable", () => {
  const paid: HouseholdExpense = {
    id: "h1",
    category_id: "c1",
    category_name: "Servicios",
    amount_minor: 198_381,
    currency: "COP",
    occurred_on: "2026-09-10",
    name: "Luz",
    note: null,
    funding: "member",
    paid_by_member_id: "m1",
    paid_by_name: "Mamá",
    expense_transaction_id: "t9",
    contribution_id: "k1",
  };

  it("shows who paid and whether it counted as a contribution", () => {
    withClient(<HouseholdExpensesTable expenses={[paid, { ...paid, id: "h2", funding: "pot", paid_by_name: null, contribution_id: null }]} />);
    expect(screen.getByText("Mamá · aporte")).toBeInTheDocument();
    expect(screen.getByText("Del pozo")).toBeInTheDocument();
  });
});

describe("DebtsTable", () => {
  const overdue: Debt = {
    id: "d1",
    name: "Nu - Tc",
    creditor_type: "other",
    creditor_label: "Nu",
    principal_minor: 823_913,
    outstanding_minor: 400_000,
    paid_total_minor: 423_913,
    annual_interest_rate: 28.34,
    due_day: 5,
    status: "active",
    currency: "COP",
    installments_total: null,
    installments_paid: null,
    installments_remaining: null,
    next_installment_on: null,
    next_installment_amount_minor: null,
    minimum_payment_minor: 114_959,
    is_overdue: null,
    standing: "overdue",
    next_due_on: "2026-09-05",
    progress: 0.51,
  };

  it("tints an overdue row and says so", () => {
    withClient(<DebtsTable debts={[overdue]} />);
    const row = screen.getAllByRole("row")[1];
    expect(row.style.backgroundColor).toContain("--danger");
    expect(within(row).getAllByText("En mora").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Nu - Tc" })).toHaveAttribute(
      "href",
      "/finanzas/deudas/d1",
    );
  });
});
