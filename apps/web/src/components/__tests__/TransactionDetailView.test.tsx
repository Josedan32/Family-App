import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));

import { TransactionDetailView } from "../finance/TransactionDetailView";
import type { Transaction } from "../finance/TransactionRow";

const expense: Transaction = {
  id: "t1",
  kind: "expense",
  categories: [
    { id: "c1", name: "Comida" },
    { id: "c2", name: "Regalo" },
  ],
  amount_minor: 169_290,
  currency: "COP",
  occurred_on: "2026-09-04",
  name: "Naty Papas",
  note: "Invitación de Ema",
  source: "manual",
  is_recurring: true,
  frequency: "monthly",
  payment_method: "nequi",
};

function renderView(transaction: Transaction, onDelete = vi.fn()) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") return { ok: true, status: 204, json: async () => null };
    if (String(url).includes("/categories")) return { ok: true, status: 200, json: async () => [] };
    return { ok: true, status: 200, json: async () => transaction };
  });
  vi.stubGlobal("fetch", fetchMock);
  onDelete.mockClear();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TransactionDetailView transactionId={transaction.id} />
    </QueryClientProvider>,
  );
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("TransactionDetailView", () => {
  it("shows every field of the movement", async () => {
    renderView(expense);
    await waitFor(() => expect(screen.getByText("Naty Papas")).toBeInTheDocument());
    expect(screen.getByText("−$ 169.290")).toBeInTheDocument();
    expect(screen.getByText("4 sep 2026")).toBeInTheDocument();
    expect(screen.getByText("Comida")).toBeInTheDocument();
    expect(screen.getByText("Regalo")).toBeInTheDocument();
    expect(screen.getByText("Nequi")).toBeInTheDocument();
    expect(screen.getByText("Mensual")).toBeInTheDocument();
    expect(screen.getByText("Invitación de Ema")).toBeInTheDocument();
  });

  it("offers edit and delete for a manual movement", async () => {
    renderView(expense);
    await waitFor(() => expect(screen.getByText("Naty Papas")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
  });

  it("goes back to that month's list after deleting", async () => {
    push.mockClear();
    const fetchMock = renderView(expense);
    await waitFor(() => expect(screen.getByText("Naty Papas")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/finanzas?tab=expense&mes=2026-09"));
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "DELETE"),
    ).toBe(true);
  });

  it.each([
    ["contribution", /Ver aportes/, "/aportes"],
    ["household_expense", /Ver gastos del hogar/, "/hogar/gastos"],
    ["savings_withdrawal", /Ver ahorros/, "/finanzas?tab=savings"],
    ["loan", /Ver préstamos/, "/finanzas/prestamos"],
    ["loan_payment", /Ver préstamos/, "/finanzas/prestamos"],
  ])("sends a %s row to where it is managed, with no edit", async (source, link, href) => {
    renderView({ ...expense, source });
    await waitFor(() => expect(screen.getByText("Naty Papas")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: link })).toHaveAttribute("href", href);
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });
});
