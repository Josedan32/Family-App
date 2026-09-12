import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoanCard, type Loan } from "../finance/LoanCard";

const loan: Loan = {
  id: "1",
  lender_member_id: "a",
  lender_name: "Daniel",
  borrower_member_id: "b",
  borrower_name: "Papá",
  amount_minor: 300_000,
  outstanding_minor: 300_000,
  currency: "COP",
  lent_on: "2026-09-01",
  due_on: null,
  status: "pending",
  note: null,
  perspective: "lender",
};

describe("LoanCard", () => {
  it("reads as a receivable to the lender", () => {
    render(<LoanCard loan={loan} />);
    expect(screen.getByText("Presté a Papá")).toBeInTheDocument();
  });

  it("reads as a payable to the borrower", () => {
    render(<LoanCard loan={{ ...loan, perspective: "borrower" }} />);
    expect(screen.getByText("Me prestó Daniel")).toBeInTheDocument();
  });

  it("reads neutrally to a third member", () => {
    // Plan 3 Task 7 added the "observer" perspective.
    render(<LoanCard loan={{ ...loan, perspective: "observer" }} />);
    expect(screen.getByText("Daniel → Papá")).toBeInTheDocument();
  });

  it("shows the Spanish status", () => {
    render(<LoanCard loan={loan} />);
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
  });

  it("shows Pagado when settled", () => {
    render(
      <LoanCard loan={{ ...loan, status: "paid", outstanding_minor: 0 }} />,
    );
    expect(screen.getByText("Pagado")).toBeInTheDocument();
  });
});
