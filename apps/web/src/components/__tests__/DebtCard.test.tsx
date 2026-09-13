import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DebtCard, type Debt } from "../finance/DebtCard";

const debtWithPlan: Debt = {
  id: "1",
  creditor_type: "addi",
  creditor_label: "Addi - Celular",
  principal_minor: 1_200_000,
  outstanding_minor: 1_000_000,
  due_day: 15,
  status: "pending",
  currency: "COP",
  installments_total: 12,
  installments_paid: 2,
  installments_remaining: 10,
  next_installment_on: "2026-12-15",
  next_installment_amount_minor: 100_000,
  is_overdue: false,
};

const debtWithoutPlan: Debt = {
  ...debtWithPlan,
  id: "2",
  creditor_type: "family",
  creditor_label: "Tío Jorge",
  installments_total: null,
  installments_paid: null,
  installments_remaining: null,
  next_installment_on: null,
  next_installment_amount_minor: null,
  is_overdue: null,
};

describe("DebtCard", () => {
  it("shows the installment plan beneath the balance", () => {
    render(<DebtCard debt={debtWithPlan} />);
    expect(screen.getByText("Cuota 2 de 12")).toBeInTheDocument();
  });

  it("shows nothing extra for a debt without a plan", () => {
    render(<DebtCard debt={debtWithoutPlan} />);
    expect(screen.queryByText(/Cuota/)).not.toBeInTheDocument();
  });
});
