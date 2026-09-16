import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TransactionRow, type Transaction } from "../finance/TransactionRow";

const expense: Transaction = {
  id: "1",
  kind: "expense",
  categories: [{ id: "c1", name: "Comida" }],
  amount_minor: 15_000,
  currency: "COP",
  occurred_on: "2026-09-02",
  name: null,
  note: "Arroz 2kg",
  source: "manual",
};

function renderRow(transaction: Transaction) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <TransactionRow transaction={transaction} />
    </QueryClientProvider>,
  );
}

describe("TransactionRow", () => {
  it("shows a true minus sign for expenses", () => {
    renderRow(expense);
    // getByText's default normalizer collapses the NBSP formatMoney emits
    // into a regular space.
    expect(screen.getByText("−$ 15.000")).toBeInTheDocument();
  });

  it("shows a plus for income", () => {
    renderRow({ ...expense, kind: "income", categories: [{ id: "c2", name: "Salario" }] });
    expect(screen.getByText("+$ 15.000")).toBeInTheDocument();
  });

  it("shows the category and the note", () => {
    renderRow(expense);
    expect(screen.getByText("Comida")).toBeInTheDocument();
    expect(screen.getByText("Arroz 2kg")).toBeInTheDocument();
  });

  it("shows the name as the title and the category as a pill when named", () => {
    renderRow({ ...expense, name: "Mercado de la semana" });
    expect(screen.getByText("Mercado de la semana")).toBeInTheDocument();
    expect(screen.getByText("Comida")).toBeInTheDocument();
  });

  it("shows every category as its own pill for a multi-category transaction", () => {
    renderRow({
      ...expense,
      name: "Mercado de la semana",
      categories: [
        { id: "c1", name: "Comida" },
        { id: "c2", name: "Transporte" },
      ],
    });
    expect(screen.getByText("Comida")).toBeInTheDocument();
    expect(screen.getByText("Transporte")).toBeInTheDocument();
  });

  it("falls back to the category as the title when there is no name", () => {
    renderRow(expense);
    expect(screen.getAllByText("Comida")).toHaveLength(1);
  });

  it("marks a derived record as managed elsewhere", () => {
    renderRow({ ...expense, source: "contribution" });
    // FR-M2-05: it cannot be edited here, and the UI must not pretend otherwise.
    expect(screen.getByText("Aporte")).toBeInTheDocument();
    expect(screen.queryByText("Editar")).not.toBeInTheDocument();
  });

  it("offers edit and delete for a manual transaction", () => {
    renderRow(expense);
    expect(screen.getByText("Editar")).toBeInTheDocument();
    expect(screen.getByText("Eliminar")).toBeInTheDocument();
  });
});
