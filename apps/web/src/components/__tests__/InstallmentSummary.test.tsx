import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InstallmentSummary } from "../finance/InstallmentSummary";

// Intl.NumberFormat inserts U+00A0 (non-breaking space) after the symbol.
const NBSP = " ";

const plan = {
  installments_total: 12,
  installments_paid: 2,
  installments_remaining: 10,
  next_installment_on: "2026-12-15",
  next_installment_amount_minor: 100_000,
  is_overdue: false,
  currency: "COP",
};

describe("InstallmentSummary", () => {
  it("shows progress through the plan", () => {
    render(<InstallmentSummary {...plan} />);
    expect(screen.getByText("Cuota 2 de 12")).toBeInTheDocument();
  });

  it("shows the next installment and its date", () => {
    render(<InstallmentSummary {...plan} />);
    expect(screen.getByText(`$${NBSP}100.000`)).toBeInTheDocument();
    expect(screen.getByText(/Próxima:/)).toBeInTheDocument();
    expect(screen.getByText(/2026-12-15/)).toBeInTheDocument();
  });

  it("flags an overdue installment", () => {
    render(<InstallmentSummary {...plan} is_overdue={true} />);
    expect(screen.getByText("En mora")).toBeInTheDocument();
  });

  it("renders nothing when there is no plan", () => {
    const { container } = render(
      <InstallmentSummary
        installments_total={null}
        installments_paid={null}
        installments_remaining={null}
        next_installment_on={null}
        next_installment_amount_minor={null}
        is_overdue={null}
        currency="COP"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("says the plan is finished when nothing remains", () => {
    render(
      <InstallmentSummary
        {...plan}
        installments_paid={12}
        installments_remaining={0}
        next_installment_on={null}
        next_installment_amount_minor={null}
      />,
    );
    expect(screen.getByText("Plan completado")).toBeInTheDocument();
  });
});
