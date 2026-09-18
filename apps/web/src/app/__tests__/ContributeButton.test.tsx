import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ContributeButton } from "../(app)/aportes/ContributeButton";

const categories = [
  { id: "c1", name: "Ahorro familiar", kind: "expense", is_contribution_category: false },
  { id: "c2", name: "Comida", kind: "expense", is_contribution_category: false },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

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

  it("marks the category picker as optional", () => {
    renderButton();
    fireEvent.click(screen.getByText("Registrar mi aporte"));
    expect(screen.getByText("Categorías (opcional, elige una o más)")).toBeInTheDocument();
  });

  describe("category selection", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("submits no categories when none is chosen", async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (String(url).includes("/categories")) return jsonResponse(categories);
        return jsonResponse({ id: "contrib1" }, 201);
      });
      vi.stubGlobal("fetch", fetchMock);
      renderButton();
      fireEvent.click(screen.getByText("Registrar mi aporte"));
      await waitFor(() => screen.getByText("Ahorro familiar"));

      fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "500.000" } });
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => {
        const call = fetchMock.mock.calls.find((args) =>
          String(args[0]).includes("/contributions"),
        ) as [string, RequestInit] | undefined;
        expect(call).toBeDefined();
        const body = JSON.parse(call![1].body as string);
        expect(body.category_ids).toEqual([]);
      });
    });

    it("submits every chosen category alongside the amount", async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (String(url).includes("/categories")) return jsonResponse(categories);
        return jsonResponse({ id: "contrib1" }, 201);
      });
      vi.stubGlobal("fetch", fetchMock);
      renderButton();
      fireEvent.click(screen.getByText("Registrar mi aporte"));
      await waitFor(() => screen.getByText("Ahorro familiar"));

      fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "500.000" } });
      fireEvent.click(screen.getByText("Ahorro familiar"));
      fireEvent.click(screen.getByText("Comida"));
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => {
        const call = fetchMock.mock.calls.find((args) =>
          String(args[0]).includes("/contributions"),
        ) as [string, RequestInit] | undefined;
        expect(call).toBeDefined();
        const body = JSON.parse(call![1].body as string);
        expect(body.category_ids).toEqual(["c1", "c2"]);
      });
    });
  });
});
