import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VIEW_MODE_STORAGE_KEY } from "@/lib/viewMode";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/finanzas/tarjetas",
}));

const clientFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  clientFetch: (...args: unknown[]) => clientFetch(...args),
}));

import { CardsPanel } from "@/app/(app)/finanzas/tarjetas/CardsPanel";
import type { CreditCard } from "@/lib/creditCards";

const base: CreditCard = {
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
  current_cycle_balance_minor: 624_900,
  credit_used_ratio: 0.31,
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
    payment_due_on: "2099-10-02",
  },
};

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CardsPanel />
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  cleanup();
  clientFetch.mockReset();
  window.localStorage.clear();
});

describe("CardsPanel", () => {
  it("invites the first card when there are none, without filters", async () => {
    clientFetch.mockResolvedValue([]);
    renderPanel();
    expect(
      await screen.findByText("Aún no tienes tarjetas"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Registra tu primera tarjeta" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Activas/)).not.toBeInTheDocument();
  });

  it("shows the centred card's balances and follows the selection", async () => {
    const second: CreditCard = {
      ...base,
      id: "c2",
      nickname: "Mastercard Mercado",
      outstanding_minor: 0,
      current_cycle_balance_minor: 312_000,
    };
    clientFetch.mockResolvedValue([base, second]);
    renderPanel();

    expect(
      await screen.findByRole("group", { name: "Visa del día a día" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ciclo abierto · sin facturar"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("group", { name: "Mastercard Mercado" }));
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /Ver extracto y movimientos/ }),
      ).toHaveAttribute("href", "/finanzas/tarjetas/c2"),
    );
  });

  it("moves cancelled cards behind their own filter", async () => {
    const cancelled: CreditCard = {
      ...base,
      id: "c9",
      nickname: "Amex antigua",
      status: "cancelled",
      outstanding_minor: 0,
    };
    clientFetch.mockResolvedValue([base, cancelled]);
    renderPanel();
    await screen.findByRole("group", { name: "Visa del día a día" });
    expect(
      screen.queryByRole("group", { name: "Amex antigua" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Canceladas\s*1/ }));
    expect(
      await screen.findByRole("group", { name: "Amex antigua" }),
    ).toBeInTheDocument();
  });

  it("hides register actions for a cancelled card", async () => {
    const cancelled: CreditCard = {
      ...base,
      status: "cancelled",
      outstanding_minor: 0,
    };
    clientFetch.mockResolvedValue([cancelled]);
    renderPanel();
    fireEvent.click(
      await screen.findByRole("radio", { name: /Canceladas\s*1/ }),
    );
    await screen.findByRole("group", { name: "Visa del día a día" });
    expect(
      screen.queryByRole("button", { name: "Registrar compra" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar pago" }),
    ).not.toBeInTheDocument();
  });

  it("opens the new-card sheet from the plus button", async () => {
    clientFetch.mockResolvedValue([base]);
    renderPanel();
    await screen.findByRole("group", { name: "Visa del día a día" });
    fireEvent.click(screen.getByRole("button", { name: "Nueva tarjeta" }));
    expect(
      screen.getByRole("dialog", { name: "Nueva tarjeta de crédito" }),
    ).toBeInTheDocument();
  });

  it("renders the table view with rows linking to each card", async () => {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, "table");
    clientFetch.mockResolvedValue([base]);
    renderPanel();
    expect(
      await screen.findByRole("table", { name: "Tarjetas de crédito" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Visa del día a día" }),
    ).toHaveAttribute("href", "/finanzas/tarjetas/c1");
    expect(
      screen.queryByRole("group", { name: "Visa del día a día" }),
    ).not.toBeInTheDocument();
  });

  it("explains when a filter matches no card", async () => {
    clientFetch.mockResolvedValue([base]);
    renderPanel();
    await screen.findByRole("group", { name: "Visa del día a día" });
    fireEvent.click(screen.getByRole("radio", { name: /Canceladas/ }));
    expect(
      await screen.findByText("Ninguna tarjeta coincide con el filtro."),
    ).toBeInTheDocument();
  });

  it("keeps an open sheet on the card it was opened for", async () => {
    const second: CreditCard = {
      ...base,
      id: "c2",
      nickname: "Mastercard Mercado",
    };
    clientFetch.mockResolvedValue([base, second]);
    renderPanel();
    await screen.findByRole("group", { name: "Visa del día a día" });
    fireEvent.click(screen.getByRole("button", { name: "Registrar pago" }));

    fireEvent.click(screen.getByRole("group", { name: "Mastercard Mercado" }));
    clientFetch.mockImplementation(async (path: string) =>
      path.endsWith("/payments") ? {} : [base, second],
    );
    const dialog = screen.getByRole("dialog", { name: "Registrar pago" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Registrar pago" }),
    );

    await waitFor(() =>
      expect(clientFetch).toHaveBeenCalledWith(
        "/me/credit-cards/c1/payments",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("closes the sheet when its card disappears after a refetch", async () => {
    const second: CreditCard = {
      ...base,
      id: "c2",
      nickname: "Mastercard Mercado",
    };
    clientFetch.mockResolvedValue([base, second]);
    const client = renderPanel();
    await screen.findByRole("group", { name: "Visa del día a día" });
    fireEvent.click(screen.getByRole("button", { name: "Registrar compra" }));
    expect(
      screen.getByRole("dialog", { name: "Registrar compra" }),
    ).toBeInTheDocument();

    clientFetch.mockResolvedValue([second]);
    await act(() => client.invalidateQueries({ queryKey: ["credit-cards"] }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Registrar compra" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows an error with retry, not the empty invitation, when loading fails", async () => {
    clientFetch.mockRejectedValueOnce(new Error("boom"));
    renderPanel();
    expect(
      await screen.findByText("No pudimos cargar tus tarjetas."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Aún no tienes tarjetas"),
    ).not.toBeInTheDocument();

    clientFetch.mockResolvedValue([base]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(
      await screen.findByRole("group", { name: "Visa del día a día" }),
    ).toBeInTheDocument();
  });
});
