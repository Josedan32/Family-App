import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ContributeButton } from "../(app)/aportes/ContributeButton";

function renderButton() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ContributeButton periodId="p1" currency="COP" />
    </QueryClientProvider>,
  );
}

describe("ContributeButton", () => {
  it("shows no error before the user touches the amount field", () => {
    renderButton();
    fireEvent.click(screen.getByText("Registrar mi aporte"));
    expect(screen.queryByText("Ingresa un monto mayor a cero")).not.toBeInTheDocument();
  });

  it("shows an inline error as soon as an empty amount is blurred, before submitting", () => {
    renderButton();
    fireEvent.click(screen.getByText("Registrar mi aporte"));
    const amount = screen.getByLabelText("Monto");
    fireEvent.blur(amount);
    expect(screen.getByText("Ingresa un monto mayor a cero")).toBeInTheDocument();
  });

  it("disables submit while the amount is invalid", () => {
    renderButton();
    fireEvent.click(screen.getByText("Registrar mi aporte"));
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });
});
