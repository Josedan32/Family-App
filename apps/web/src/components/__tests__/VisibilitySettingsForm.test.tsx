import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VisibilitySettingsForm } from "../privacy/VisibilitySettingsForm";

const initial = {
  income: "summary" as const,
  expenses: "summary" as const,
  savings: "summary" as const,
  debts: "private" as const,
  disclosures: [
    "Los totales del hogar incluyen a todos. Tu configuración controla si los demás ven tus números individuales, no si cuentas en el total del hogar.",
    "Los aportes al hogar siempre son visibles para toda la familia.",
  ],
};

function renderForm() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <VisibilitySettingsForm initial={initial} />
    </QueryClientProvider>,
  );
}

describe("VisibilitySettingsForm", () => {
  it("offers all four modules in Spanish", () => {
    renderForm();
    for (const label of ["Ingresos", "Gastos", "Ahorros", "Deudas"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows debts starting private", () => {
    renderForm();
    expect(screen.getByLabelText("Deudas")).toHaveValue("private");
  });

  it("renders BOTH disclosures verbatim from the API", () => {
    // FR-M3-08. The copy lives with the rules so the two cannot drift apart.
    renderForm();
    for (const text of initial.disclosures) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("does not hardcode disclosure copy", () => {
    const custom = { ...initial, disclosures: ["Texto nuevo del servidor"] };
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <VisibilitySettingsForm initial={custom} />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Texto nuevo del servidor")).toBeInTheDocument();
  });
});
