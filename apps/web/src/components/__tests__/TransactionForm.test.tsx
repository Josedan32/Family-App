import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionForm } from "../finance/TransactionForm";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

const categories = [
  { id: "c1", name: "Comida", kind: "expense" },
  { id: "c2", name: "Transporte", kind: "expense" },
];

function renderForm(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <TransactionForm kind="expense" currency="COP" onDone={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("TransactionForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the frequency selector hidden until recurring is checked", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(categories));
    renderForm(fetchMock);
    await waitFor(() => expect(screen.getByText("Comida")).toBeInTheDocument());

    expect(screen.queryByRole("radiogroup", { name: "Frecuencia" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));

    expect(screen.getByRole("radiogroup", { name: "Frecuencia" })).toBeInTheDocument();
    expect(screen.getByText("Mensual")).toBeInTheDocument();
    expect(screen.getByText("Único")).toBeInTheDocument();
    expect(screen.getByText("Quincenal")).toBeInTheDocument();
  });

  it("shows the Spanish payment method options", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(categories));
    renderForm(fetchMock);
    await waitFor(() => expect(screen.getByText("Comida")).toBeInTheDocument());

    expect(screen.getByText("Efectivo")).toBeInTheDocument();
    expect(screen.getByText("Nequi")).toBeInTheDocument();
    expect(screen.getByText("Bancolombia")).toBeInTheDocument();
  });

  it("submits recurring/frequency/payment_method with the exact shape the API expects", async () => {
    let sent: unknown = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/categories")) return jsonResponse(categories);
      sent = init?.body ? JSON.parse(init.body as string) : null;
      return jsonResponse({ id: "t1", ...(sent as object) }, 201);
    });
    renderForm(fetchMock);
    await waitFor(() => expect(screen.getByText("Comida")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "15000" } });
    fireEvent.click(screen.getByText("Comida"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("Quincenal"));
    fireEvent.click(screen.getByText("Nequi"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({
      is_recurring: true,
      frequency: "biweekly",
      payment_method: "nequi",
    });
  });

  it("sends a null frequency when not recurring", async () => {
    let sent: unknown = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/categories")) return jsonResponse(categories);
      sent = init?.body ? JSON.parse(init.body as string) : null;
      return jsonResponse({ id: "t1", ...(sent as object) }, 201);
    });
    renderForm(fetchMock);
    await waitFor(() => expect(screen.getByText("Comida")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "15000" } });
    fireEvent.click(screen.getByText("Comida"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({
      is_recurring: false,
      frequency: null,
      payment_method: "cash",
    });
  });
});
