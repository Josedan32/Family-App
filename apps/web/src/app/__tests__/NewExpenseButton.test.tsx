import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NewExpenseButton } from "../(app)/hogar/gastos/NewExpenseButton";
import { formatMoney } from "@/lib/money";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const categories = [{ id: "c1", name: "Otros", kind: "expense" }];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderButton() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <NewExpenseButton currency="COP" potBalanceMinor={700_000} />
    </QueryClientProvider>,
  );
}

async function openAndFillForm() {
  fireEvent.click(screen.getByLabelText("Agregar gasto del hogar"));
  await waitFor(() => screen.getByText("Otros"));
  fireEvent.click(screen.getByText("Otros"));
  fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "500.000" } });
}

describe("NewExpenseButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the insufficient_pot message with the pot balance this screen already has", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/categories")) return jsonResponse(categories);
        return jsonResponse(
          { type: "insufficient_pot", title: "El pozo del hogar no alcanza", status: 409 },
          409,
        );
      }),
    );
    renderButton();
    await openAndFillForm();

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      `El pozo no alcanza. Saldo disponible: ${formatMoney(700_000, "COP")}.`,
    );
  });

  it("shows the no_open_period message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/categories")) return jsonResponse(categories);
        return jsonResponse(
          { type: "no_open_period", title: "No hay un periodo de aportes abierto", status: 409 },
          409,
        );
      }),
    );
    renderButton();
    await openAndFillForm();

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("No hay un periodo de aportes abierto este mes.");
  });
});
