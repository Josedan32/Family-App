import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const clientFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  clientFetch: (...args: unknown[]) => clientFetch(...args),
}));

import { CardForm } from "../creditCards/CardForm";

function wrap(node: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}

afterEach(() => clientFetch.mockReset());

describe("CardForm", () => {
  it("previews the next cutoff and limit date from the two day fields", () => {
    wrap(<CardForm onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText("Día de corte"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Días para pagar"), { target: { value: "17" } });
    expect(
      screen.getByText(/Corte el 15 de cada mes; la fecha límite de pago cae 17 días después/),
    ).toBeInTheDocument();
  });

  it.each(["32", "0"])("rejects cutoff day %s and keeps submit disabled", (day) => {
    wrap(<CardForm onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText("Día de corte"), { target: { value: day } });
    expect(screen.getByRole("button", { name: "Registrar tarjeta" })).toBeDisabled();
  });

  it("sends decimals with a comma as numbers and the floor as integer minor units", async () => {
    clientFetch.mockResolvedValue({});
    const done = vi.fn();
    wrap(<CardForm onDone={done} />);
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Visa" } });
    fireEvent.change(screen.getByLabelText("Banco"), { target: { value: "Bancolombia" } });
    fireEvent.change(screen.getByLabelText("Cupo"), { target: { value: "8.000.000" } });
    fireEvent.change(screen.getByLabelText("Día de corte"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Días para pagar"), { target: { value: "17" } });
    fireEvent.change(screen.getByLabelText("Interés mensual"), { target: { value: "1,89" } });
    fireEvent.change(screen.getByLabelText("Porcentaje"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Mínimo desde"), { target: { value: "50.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar tarjeta" }));

    await waitFor(() => expect(done).toHaveBeenCalled());
    const [path, init] = clientFetch.mock.calls[0];
    expect(path).toBe("/me/credit-cards");
    expect(JSON.parse(init.body)).toEqual({
      nickname: "Visa",
      bank_label: "Bancolombia",
      credit_limit_minor: 8_000_000,
      interest_rate_monthly_pct: 1.89,
      minimum_payment_pct: 10,
      minimum_payment_floor_minor: 50_000,
      statement_cutoff_day: 15,
      payment_due_days: 17,
    });
  });
});
