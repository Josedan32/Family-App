import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MonthlySummaryCard } from "../finance/MonthlySummaryCard";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

const healthySummary = {
  period: "2026-09",
  currency: "COP",
  income_minor: 1_000_000,
  expenses_minor: 100_000,
  saved_minor: 100_000,
  debt_payments_minor: 100_000,
  remaining_minor: 700_000,
  status: "healthy" as const,
};

function renderCard(fetchMock: ReturnType<typeof vi.fn>, endpoint = "/me/monthly-summary") {
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MonthlySummaryCard endpoint={endpoint} />
    </QueryClientProvider>,
  );
}

describe("MonthlySummaryCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the four totals, the remaining balance and the status label", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(healthySummary));
    renderCard(fetchMock);

    await waitFor(() => expect(screen.getByText("Saludable")).toBeInTheDocument());
    expect(screen.getByText("$ 700.000")).toBeInTheDocument();
  });

  it("shows the tight status label in Spanish", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ...healthySummary, remaining_minor: 50_000, status: "tight" }),
    );
    renderCard(fetchMock);

    await waitFor(() => expect(screen.getByText("Ajustado")).toBeInTheDocument());
  });

  it("shows the overspent status label in Spanish", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ...healthySummary, remaining_minor: -100_000, status: "overspent" }),
    );
    renderCard(fetchMock);

    await waitFor(() => expect(screen.getByText("En descubierto")).toBeInTheDocument());
  });

  it("defaults the month picker to the current month", () => {
    const fetchMock = vi.fn(async () => jsonResponse(healthySummary));
    renderCard(fetchMock);

    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    expect(screen.getByDisplayValue(expected)).toBeInTheDocument();
  });

  it("requests the caller-supplied endpoint, so it also serves another member", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(healthySummary));
    renderCard(fetchMock, "/members/papa-id/monthly-summary");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/proxy/members/papa-id/monthly-summary"),
        expect.anything(),
      ),
    );
  });
});
