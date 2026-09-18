import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/finanzas/nuevo",
  useSearchParams: () => searchParams,
}));

import NewTransactionPage from "../page";

function renderPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <NewTransactionPage />
    </QueryClientProvider>,
  );
}

describe("NewTransactionPage", () => {
  it("defaults to an expense form", () => {
    searchParams = new URLSearchParams();
    renderPage();
    expect(screen.getByRole("heading", { name: "Registrar gasto" })).toBeInTheDocument();
  });

  it("renders an income form when kind=income", () => {
    searchParams = new URLSearchParams({ kind: "income" });
    renderPage();
    expect(screen.getByRole("heading", { name: "Registrar ingreso" })).toBeInTheDocument();
  });
});
