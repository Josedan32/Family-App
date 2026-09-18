import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Goal } from "../finance/GoalCard";
import { GoalDetail } from "../finance/GoalDetail";

const reached: Goal = {
  id: "g1",
  name: "Pasaporte",
  target_amount_minor: 300_000,
  balance_minor: 300_000,
  progress: 1,
  currency: "COP",
  priority: "alta",
  target_date: null,
  days_remaining: null,
  is_overdue: false,
  state: "completado",
  used_on: null,
};

function renderDetail(goal: Goal, fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))) {
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GoalDetail goal={goal} />
    </QueryClientProvider>,
  );
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("GoalDetail", () => {
  it("offers to mark a reached goal as used", async () => {
    const fetchMock = renderDetail(reached);

    fireEvent.click(screen.getByRole("button", { name: "Marcar como usada" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/me/savings-goals/g1/use");
    expect(init.method).toBe("POST");
  });

  it("does not offer it before the goal is reached", () => {
    renderDetail({ ...reached, balance_minor: 100_000, progress: 0.33, state: "en_progreso" });
    expect(screen.queryByRole("button", { name: "Marcar como usada" })).not.toBeInTheDocument();
  });

  it("takes no new deposits or withdrawals once used, and can be undone", async () => {
    const fetchMock = renderDetail({ ...reached, state: "usada", used_on: "2026-08-20" });

    expect(screen.queryByRole("radiogroup", { name: "Tipo de movimiento" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/me/savings-goals/g1/use");
    expect(init.method).toBe("DELETE");
  });
});
