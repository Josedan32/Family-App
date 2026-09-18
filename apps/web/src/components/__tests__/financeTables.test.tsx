import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Goal } from "../finance/GoalCard";
import type { HouseholdExpense } from "../finance/HouseholdExpenseRow";
import type { Transaction } from "../finance/TransactionRow";
import {
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

  it("opens the usual card, with its actions, when a row is tapped", () => {
    withClient(<TransactionsTable kind="expense" transactions={[expense]} />);
    fireEvent.click(screen.getByRole("button", { name: "Mercado" }));
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
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
