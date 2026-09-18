import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DebtCard, type Debt } from "../finance/DebtCard";

const debtWithPlan: Debt = {
  id: "1",
  name: "Celular",
  creditor_type: "addi",
  creditor_label: "Addi - Celular",
  principal_minor: 1_200_000,
  outstanding_minor: 1_000_000,
  paid_total_minor: 200_000,
  annual_interest_rate: null,
  due_day: 15,
  status: "pending",
  currency: "COP",
  installments_total: 12,
  installments_paid: 2,
  installments_remaining: 10,
  next_installment_on: "2026-12-15",
  next_installment_amount_minor: 100_000,
  minimum_payment_minor: null,
  is_overdue: false,
  standing: "up_to_date",
  next_due_on: "2026-12-15",
  progress: 0.1667,
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

  it("hides the creditor label when it duplicates the name", () => {
    const debtWithSameLabel: Debt = { ...debtWithPlan, name: "Addi", creditor_label: "Addi" };
    render(<DebtCard debt={debtWithSameLabel} />);
    expect(screen.getAllByText("Addi")).toHaveLength(1);
  });

  it("shows the creditor label when it differs from the name", () => {
    render(<DebtCard debt={debtWithPlan} />);
    expect(screen.getByText("Addi - Celular")).toBeInTheDocument();
  });

  it("says where the debt stands, in words and in color", () => {
    const { container } = render(<DebtCard debt={{ ...debtWithPlan, standing: "overdue" }} />);
    expect(screen.getByText("En mora")).toBeInTheDocument();
    expect((container.firstChild as HTMLElement).style.backgroundColor).toContain("--danger");
  });

  it("shows a paid debt as paid, without a next payment", () => {
    render(
      <DebtCard
        debt={{ ...debtWithPlan, standing: "paid", outstanding_minor: 0, next_due_on: null, progress: 1 }}
      />,
    );
    expect(screen.getByText("Pagada")).toBeInTheDocument();
    expect(screen.queryByText(/Próximo pago/)).not.toBeInTheDocument();
  });

  it("shows the next payment date while the debt is open", () => {
    render(<DebtCard debt={debtWithoutPlan} />);
    expect(screen.getByText("Próximo pago: 15 dic 2026")).toBeInTheDocument();
  });

  it("shows how much of the debt is paid", () => {
    render(<DebtCard debt={debtWithPlan} />);
    expect(screen.getByRole("progressbar", { name: /Abonado/ })).toHaveAttribute("aria-valuenow", "17");
  });
});
