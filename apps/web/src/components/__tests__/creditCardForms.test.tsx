import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const clientFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  clientFetch: (...args: unknown[]) => clientFetch(...args),
}));

import { CardForm } from "../creditCards/CardForm";
import { PurchaseForm } from "../creditCards/PurchaseForm";
import type { CreditCard } from "@/lib/creditCards";

const card: CreditCard = {
  id: "c1",
  nickname: "Visa del día a día",
  bank_label: "Bancolombia",
  credit_limit_minor: 8_000_000,
  interest_rate_monthly_pct: 1.89,
  minimum_payment_pct: 10,
  minimum_payment_floor_minor: 50_000,
  statement_cutoff_day: 15,
  payment_due_days: 17,
  status: "active",
  currency: "COP",
  outstanding_minor: 1_842_300,
  current_cycle_balance_minor: 0,
  credit_used_ratio: 0.23,
  latest_statement: {
    id: "s1",
    cycle_starts_on: "2026-08-16",
    cycle_ends_on: "2026-09-15",
    opening_balance_minor: 0,
    purchases_total_minor: 0,
    installments_due_minor: 0,
    interest_charged_minor: 0,
    payments_total_minor: 0,
    closing_balance_minor: 1_842_300,
    minimum_payment_minor: 184_230,
    payment_due_on: "2026-10-02",
  },
};

/** The purchase form also loads categories; route them apart from the POST. */
function answerCategories() {
  clientFetch.mockImplementation((path: string) =>
    Promise.resolve(path.startsWith("/categories") ? [] : {}),
  );
}

function postCall(pathPart: string) {
  return clientFetch.mock.calls.find(([path]) => String(path).includes(pathPart));
}

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

describe("PurchaseForm", () => {
  it("does not colour the amount as an expense and says it is not one", () => {
    answerCategories();
    wrap(<PurchaseForm card={card} onDone={() => {}} />);
    expect(screen.getByText(/No cuenta como gasto/)).toBeInTheDocument();
    expect(document.querySelector(".text-expense")).toBeNull();
  });

  it("keeps submit disabled for a zero amount", () => {
    answerCategories();
    wrap(<PurchaseForm card={card} onDone={() => {}} />);
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Mercado" } });
    expect(screen.getByRole("button", { name: "Registrar compra" })).toBeDisabled();
  });

  it("reveals the three installment fields together and requires them", () => {
    answerCategories();
    wrap(<PurchaseForm card={card} onDone={() => {}} />);
    expect(screen.queryByLabelText("Valor cuota")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /A cuotas/ }));
    expect(screen.getByLabelText("Valor cuota")).toBeInTheDocument();
    expect(screen.getByLabelText("Primera cuota")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "6" }));
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Colchón" } });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "1.080.000" } });
    // installment amount still empty → cannot submit
    expect(screen.getByRole("button", { name: "Registrar compra" })).toBeDisabled();
    expect(screen.getByLabelText("Valor cuota")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Valor cuota"), { target: { value: "180.000" } });
    expect(screen.getByRole("button", { name: "Registrar compra" })).toBeEnabled();
  });

  it("posts a single-payment purchase without installment fields", async () => {
    answerCategories();
    const done = vi.fn();
    wrap(<PurchaseForm card={card} onDone={done} />);
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Mercado" } });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "184.900" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar compra" }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    const [path, init] = postCall("/purchases")!;
    expect(path).toBe("/me/credit-cards/c1/purchases");
    const body = JSON.parse(init.body);
    expect(body.amount_minor).toBe(184_900);
    expect(body.category_id).toBeNull();
    expect(body).not.toHaveProperty("installments_total");
  });

  it("posts the installment plan with its three fields", async () => {
    answerCategories();
    const done = vi.fn();
    wrap(<PurchaseForm card={card} onDone={done} />);
    fireEvent.click(screen.getByRole("switch", { name: /A cuotas/ }));
    fireEvent.click(screen.getByRole("button", { name: "6" }));
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Colchón" } });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "1.080.000" } });
    fireEvent.change(screen.getByLabelText("Valor cuota"), { target: { value: "180.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar compra" }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    const body = JSON.parse(postCall("/purchases")![1].body);
    expect(body).toMatchObject({
      amount_minor: 1_080_000,
      installments_total: 6,
      installment_amount_minor: 180_000,
    });
    expect(body.first_installment_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
