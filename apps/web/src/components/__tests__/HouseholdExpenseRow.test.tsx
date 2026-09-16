import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  HouseholdExpenseRow,
  type HouseholdExpense,
} from "../finance/HouseholdExpenseRow";

// Intl.NumberFormat inserts U+00A0 (non-breaking space) after the symbol.
const NBSP = " ";

const potExpense: HouseholdExpense = {
  id: "1",
  category_id: "c1",
  category_name: "Otros",
  amount_minor: 1_200_000,
  currency: "COP",
  occurred_on: "2026-09-03",
  name: null,
  note: "Arriendo septiembre",
  funding: "pot",
  paid_by_member_id: null,
  paid_by_name: null,
  expense_transaction_id: null,
  contribution_id: null,
};

const memberExpense: HouseholdExpense = {
  ...potExpense,
  id: "2",
  category_name: "Comida",
  amount_minor: 250_000,
  note: "Mercado",
  funding: "member",
  paid_by_member_id: "m1",
  paid_by_name: "Mamá",
  expense_transaction_id: "t1",
  contribution_id: null,
};

describe("HouseholdExpenseRow", () => {
  it("shows a pot-funded expense as paid from the pot", () => {
    render(<HouseholdExpenseRow expense={potExpense} />);
    expect(screen.getByText("Del pozo")).toBeInTheDocument();
    expect(screen.getByText(`$${NBSP}1.200.000`)).toBeInTheDocument();
  });

  it("names who paid a member-funded expense", () => {
    // Who paid is household information, not personal information (§5.3).
    render(<HouseholdExpenseRow expense={memberExpense} />);
    expect(screen.getByText("Pagó Mamá")).toBeInTheDocument();
  });

  it("marks an in-kind expense as counting toward the contribution", () => {
    render(
      <HouseholdExpenseRow expense={{ ...memberExpense, contribution_id: "c9" }} />,
    );
    expect(screen.getByText("Cuenta como aporte")).toBeInTheDocument();
  });

  it("shows the name as the title and the category as a pill when named", () => {
    render(
      <HouseholdExpenseRow expense={{ ...potExpense, name: "Factura de luz" }} />,
    );
    expect(screen.getByText("Factura de luz")).toBeInTheDocument();
    expect(screen.getByText("Otros")).toBeInTheDocument();
  });

  it("falls back to the category as the title when there is no name", () => {
    render(<HouseholdExpenseRow expense={potExpense} />);
    expect(screen.getAllByText("Otros")).toHaveLength(1);
  });

  it("never renders a PrivateBlock", () => {
    // The household ledger has no visibility rules at all (FR-M4-15).
    const { container } = render(<HouseholdExpenseRow expense={memberExpense} />);
    expect(container.textContent).not.toContain("Privado");
  });
});
