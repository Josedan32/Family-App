import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/finanzas",
}));

const clientFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  clientFetch: (...args: unknown[]) => clientFetch(...args),
}));

import { DebtsPanel } from "@/app/(app)/finanzas/DebtsPanel";

const debt = {
  id: "d1",
  creditor: "Banco",
  name: "Libranza",
  currency: "COP",
  principal_minor: 1_000_000,
  outstanding_minor: 800_000,
  status: "active",
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DebtsPanel onCreate={() => {}} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  clientFetch.mockReset();
});

describe("DebtsPanel credit cards link", () => {
  it("links to the cards screen when there are no debts", async () => {
    clientFetch.mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByRole("link", { name: /Tarjetas de crédito/ })).toHaveAttribute(
      "href",
      "/finanzas/tarjetas",
    );
    expect(screen.getByRole("button", { name: "Registrar una deuda" })).toBeTruthy();
  });

  it("links to the cards screen when debts exist", async () => {
    clientFetch.mockResolvedValue([debt]);
    renderPanel();
    expect(await screen.findByRole("link", { name: /Tarjetas de crédito/ })).toHaveAttribute(
      "href",
      "/finanzas/tarjetas",
    );
    expect(screen.queryByRole("button", { name: "Registrar una deuda" })).toBeNull();
  });
});
