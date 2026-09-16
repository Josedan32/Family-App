import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EffortAdjustmentForm } from "../(app)/tareas/admin/EffortAdjustmentForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const members = [
  { id: "m1", display_name: "Papá" },
  { id: "m2", display_name: "Mamá" },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderForm() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <EffortAdjustmentForm members={members} />
    </QueryClientProvider>,
  );
}

describe("EffortAdjustmentForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires the reason in the DOM, not only in the API", () => {
    // C-12 / FR-M8-14: an adjustment without a reason is indistinguishable
    // from favouritism, so this is not merely a server-side rule.
    renderForm();
    expect(screen.getByLabelText("Motivo")).toBeRequired();
  });

  it("keeps the submit button disabled without a reason", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Puntos"), { target: { value: "12" } });
    expect(screen.getByRole("button", { name: "Registrar ajuste" })).toBeDisabled();
  });

  it("sends member, points and reason exactly as the API expects", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      expect(body).toEqual({ member_id: "m2", points: 12, reason: "Pintó la sala" });
      return jsonResponse({ id: "a1", ...body });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderForm();
    fireEvent.change(screen.getByLabelText("Miembro"), { target: { value: "m2" } });
    fireEvent.change(screen.getByLabelText("Puntos"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Pintó la sala" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar ajuste" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
