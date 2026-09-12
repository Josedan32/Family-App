import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TransactionRow } from "../finance/TransactionRow";

const expense = {
  id: "1",
  kind: "expense" as const,
  category_id: "c1",
  category_name: "Comida",
  amount_minor: 15_000,
  currency: "COP",
  occurred_on: "2026-09-02",
  note: "Arroz 2kg",
  source: "manual",
};

describe("TransactionRow", () => {
  it("shows a true minus sign for expenses", () => {
    render(<TransactionRow transaction={expense} />);
    // getByText's default normalizer collapses the NBSP formatMoney emits
    // into a regular space.
    expect(screen.getByText("−$ 15.000")).toBeInTheDocument();
  });

  it("shows a plus for income", () => {
    render(
      <TransactionRow
        transaction={{ ...expense, kind: "income", category_name: "Salario" }}
      />,
    );
    expect(screen.getByText("+$ 15.000")).toBeInTheDocument();
  });

  it("shows the category and the note", () => {
    render(<TransactionRow transaction={expense} />);
    expect(screen.getByText("Comida")).toBeInTheDocument();
    expect(screen.getByText("Arroz 2kg")).toBeInTheDocument();
  });

  it("marks a derived record as managed elsewhere", () => {
    render(<TransactionRow transaction={{ ...expense, source: "contribution" }} />);
    // FR-M2-05: it cannot be edited here, and the UI must not pretend otherwise.
    expect(screen.getByText("Aporte")).toBeInTheDocument();
  });
});
