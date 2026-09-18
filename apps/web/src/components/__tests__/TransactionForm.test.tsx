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

    fireEvent.click(screen.getByRole("checkbox", { name: /recurrente/ }));

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
    fireEvent.click(screen.getByRole("checkbox", { name: /recurrente/ }));
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

  describe("editing", () => {
    const existing = {
      id: "t1",
      categories: [{ id: "c1", name: "Comida" }],
      amount_minor: 15000,
      occurred_on: "2026-09-02",
      name: null,
      note: null,
      is_recurring: true,
      frequency: "biweekly",
      payment_method: "nequi",
    };

    function renderEdit(fetchMock: ReturnType<typeof vi.fn>) {
      vi.stubGlobal("fetch", fetchMock);
      render(
        <QueryClientProvider client={new QueryClient()}>
          <TransactionForm
            kind="expense"
            currency="COP"
            transaction={existing}
            onDone={vi.fn()}
          />
        </QueryClientProvider>,
      );
    }

    it("opens with the saved payment method and recurrence, not the defaults", async () => {
      renderEdit(vi.fn(async () => jsonResponse(categories)));
      await waitFor(() => expect(screen.getByText("Comida")).toBeInTheDocument());

      expect(screen.getByRole("radio", { name: "Nequi" })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("radio", { name: "Efectivo" })).toHaveAttribute(
        "aria-checked",
        "false",
      );
      expect(screen.getByRole("checkbox", { name: /recurrente/ })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Quincenal" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    });

    it("sends payment method and recurrence in the PATCH", async () => {
      let sent: Record<string, unknown> | null = null;
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/categories")) return jsonResponse(categories);
        sent = JSON.parse(init?.body as string);
        return jsonResponse({ id: "t1" });
      });
      renderEdit(fetchMock);
      await waitFor(() => expect(screen.getByText("Comida")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("radio", { name: "Bancolombia" }));
      fireEvent.click(screen.getByRole("checkbox", { name: /recurrente/ }));
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

      await waitFor(() => expect(sent).not.toBeNull());
      expect(sent).toMatchObject({
        payment_method: "bancolombia",
        is_recurring: false,
        frequency: null,
      });
    });
  });

  describe("as my contribution", () => {
    function renderCreate(kind: "income" | "expense", fetchMock: ReturnType<typeof vi.fn>) {
      vi.stubGlobal("fetch", fetchMock);
      render(
        <QueryClientProvider client={new QueryClient()}>
          <TransactionForm kind={kind} currency="COP" onDone={vi.fn()} />
        </QueryClientProvider>,
      );
    }

    it("offers to count a new expense as my contribution", async () => {
      renderCreate("expense", vi.fn(async () => jsonResponse(categories)));
      await waitFor(() => expect(screen.getByText("Comida")).toBeInTheDocument());

      expect(
        screen.getByRole("checkbox", { name: /Este gasto fue mi aporte al hogar/ }),
      ).toBeInTheDocument();
    });

    it("does not offer it for income", async () => {
      renderCreate("income", vi.fn(async () => jsonResponse(categories)));
      await waitFor(() => expect(screen.getByText("Comida")).toBeInTheDocument());

      expect(screen.queryByRole("checkbox", { name: /mi aporte/ })).not.toBeInTheDocument();
    });

    it("records it as a member-paid household expense that counts toward the period", async () => {
      let url = "";
      let sent: Record<string, unknown> | null = null;
      const fetchMock = vi.fn(async (target: string, init?: RequestInit) => {
        if (target.includes("/categories")) return jsonResponse(categories);
        url = target;
        sent = JSON.parse(init?.body as string);
        return jsonResponse({ id: "e1" }, 201);
      });
      renderCreate("expense", fetchMock);
      await waitFor(() => expect(screen.getByText("Comida")).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "80.000" } });
      fireEvent.click(screen.getByRole("checkbox", { name: /mi aporte/ }));
      fireEvent.click(screen.getByText("Comida"));
      fireEvent.change(screen.getByLabelText("Nombre (opcional)"), {
        target: { value: "Mercado" },
      });
      fireEvent.click(screen.getByRole("radio", { name: "Nequi" }));
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(sent).not.toBeNull());
      expect(url).toContain("/household-expenses");
      expect(sent).toMatchObject({
        category_id: "c1",
        amount_minor: 80_000,
        name: "Mercado",
        funding: "member",
        counts_as_contribution: true,
        payment_method: "nequi",
      });
    });

    it("hides recurrence, which a contribution does not have", async () => {
      renderCreate("expense", vi.fn(async () => jsonResponse(categories)));
      await waitFor(() => expect(screen.getByText("Comida")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("checkbox", { name: /mi aporte/ }));

      expect(screen.queryByRole("checkbox", { name: /recurrente/ })).not.toBeInTheDocument();
    });
  });
});
