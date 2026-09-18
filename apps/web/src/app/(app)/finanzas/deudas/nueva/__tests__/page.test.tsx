import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/finanzas/deudas/nueva",
}));

import NewDebtPage from "../page";

function renderPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <NewDebtPage />
    </QueryClientProvider>,
  );
}

describe("NewDebtPage", () => {
  it("renders the debt form as a full page, not a modal", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Nueva deuda" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Tasa de interés anual % (opcional)")).toBeInTheDocument();
  });
});
