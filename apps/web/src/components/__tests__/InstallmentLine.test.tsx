import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InstallmentLine } from "../finance/InstallmentLine";

describe("InstallmentLine", () => {
  it("shows the next due date and progress compactly", () => {
    // Format required by design: "<day> <mes> · <paid> de <total>".
    render(
      <InstallmentLine
        installments_paid={14}
        installments_total={36}
        next_installment_on="2026-09-02"
      />,
    );
    expect(screen.getByText("2 sep · 14 de 36")).toBeInTheDocument();
  });

  it("renders nothing when there is no installment plan", () => {
    const { container } = render(
      <InstallmentLine
        installments_paid={null}
        installments_total={null}
        next_installment_on={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("says the plan is finished when nothing remains", () => {
    render(
      <InstallmentLine
        installments_paid={36}
        installments_total={36}
        next_installment_on={null}
      />,
    );
    expect(screen.getByText("Plan completado")).toBeInTheDocument();
  });
});
