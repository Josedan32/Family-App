import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AbsenceForm, type Absence } from "../(app)/ajustes/ausencias/AbsenceForm";

const absences: Absence[] = [
  { id: "a1", member_id: "m1", starts_on: "2026-09-01", ends_on: "2026-09-14", reason: "Viaje" },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderForm(initial: Absence[] = absences) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <AbsenceForm initial={initial} />
    </QueryClientProvider>,
  );
}

describe("AbsenceForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists existing absences with their reason", () => {
    renderForm();
    expect(screen.getByText("Viaje")).toBeInTheDocument();
  });

  it("shows the caption explaining the reason is optional", () => {
    renderForm();
    expect(
      screen.getByText("Opcional. Tu familia ve que no estás; el porqué es cosa tuya."),
    ).toBeInTheDocument();
  });

  it("sends starts_on, ends_on and reason exactly as the API expects", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      expect(body).toEqual({
        starts_on: "2026-10-01",
        ends_on: "2026-10-05",
        reason: "Congreso",
      });
      return jsonResponse({ id: "a2", member_id: "m1", ...body });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderForm([]);
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("Motivo (opcional)"), {
      target: { value: "Congreso" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar ausencia" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("removes an absence through Quitar", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/me/absences/a1");
      expect(init?.method).toBe("DELETE");
      return { ok: true, status: 204, json: async () => null };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
