import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Assignment, AssignmentMember } from "@/components/chores/AssignmentRow";
import { addDays, todayLocal } from "@/lib/dates";

import { TareasClient } from "../(app)/tareas/TareasClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const MEMBERS: AssignmentMember[] = [
  { id: "m1", display_name: "Daniel" },
  { id: "m2", display_name: "Papá" },
];

function assignment(over: Partial<Assignment> = {}): Assignment {
  return {
    id: "a1",
    chore_id: "c1",
    chore_name: "Sacar la basura",
    chore_activities: [],
    chore_requirements: [],
    chore_expectation: null,
    member_id: "m1",
    member_name: "Daniel",
    member_photo_url: null,
    // Today, so the chore sits in the one group that starts open.
    due_on: todayLocal(),
    status: "pending",
    effort_points: 1,
    completed_at: null,
    completed_by_member_id: null,
    ...over,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderClient(
  cycle: Parameters<typeof TareasClient>[0]["cycle"],
  opts: { isAdmin?: boolean } = {},
) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <TareasClient
        cycle={cycle}
        members={MEMBERS}
        myMemberId="m1"
        isAdmin={opts.isAdmin ?? false}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("TareasClient — sorteo visto", () => {
  it("marks an unseen cycle as seen on mount", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(null, 204));
    vi.stubGlobal("fetch", fetchMock);

    renderClient({
      id: "cycle-1", starts_on: "2026-09-01", ends_on: "2026-09-28",
      seed: 1, seen: false, assignments: [assignment()],
    });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/chore-cycles/cycle-1/seen"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("does not call seen again for a cycle already marked seen", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(null, 204));
    vi.stubGlobal("fetch", fetchMock);

    renderClient({
      id: "cycle-1", starts_on: "2026-09-01", ends_on: "2026-09-28",
      seed: 1, seen: true, assignments: [assignment()],
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("TareasClient — filtro de estado", () => {
  it("shows an empty-state message when the status filter matches neither pending nor done", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(null, 204));
    vi.stubGlobal("fetch", fetchMock);

    const { getByLabelText, findByText } = renderClient({
      id: "cycle-1", starts_on: "2026-09-01", ends_on: "2026-09-28",
      seed: 1, seen: true, assignments: [assignment({ status: "skipped" })],
    });

    fireEvent.change(getByLabelText("Estado"), { target: { value: "skipped" } });

    expect(await findByText("No hay tareas omitidas en este periodo.")).toBeInTheDocument();
  });

  it("does not show the empty-state message when pending items are visible", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(null, 204));
    vi.stubGlobal("fetch", fetchMock);

    const { queryByText } = renderClient({
      id: "cycle-1", starts_on: "2026-09-01", ends_on: "2026-09-28",
      seed: 1, seen: true, assignments: [assignment({ status: "pending" })],
    });

    expect(queryByText(/No hay tareas/)).not.toBeInTheDocument();
  });
});

describe("TareasClient — vista de administrador", () => {
  it("does not show the scope tabs to a non-admin", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(null, 204)));

    const { queryByRole } = renderClient({
      id: "cycle-1", starts_on: "2026-09-01", ends_on: "2026-09-28",
      seed: 1, seen: true, assignments: [assignment()],
    });

    expect(queryByRole("tablist", { name: "Alcance de la vista" })).not.toBeInTheDocument();
  });

  it("shows a distinct Todas/Mis tareas toggle for an admin", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(null, 204)));

    const { getByRole } = renderClient(
      {
        id: "cycle-1", starts_on: "2026-09-01", ends_on: "2026-09-28",
        seed: 1, seen: true, assignments: [assignment()],
      },
      { isAdmin: true },
    );

    expect(getByRole("tab", { name: "Todas las tareas" })).toBeInTheDocument();
    expect(getByRole("tab", { name: "Mis tareas" })).toBeInTheDocument();
  });

  it("an admin's Mis tareas tab filters to their own assignments only", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(null, 204)));

    const { getByRole, getByText, queryByText } = renderClient(
      {
        id: "cycle-1", starts_on: "2026-09-01", ends_on: "2026-09-28",
        seed: 1, seen: true,
        assignments: [
          assignment({ id: "a1", member_id: "m1", member_name: "Daniel", chore_name: "Sacar la basura" }),
          assignment({ id: "a2", member_id: "m2", member_name: "Papá", chore_name: "Lavar platos" }),
        ],
      },
      { isAdmin: true },
    );

    expect(getByText("Sacar la basura")).toBeInTheDocument();
    expect(getByText("Lavar platos")).toBeInTheDocument();

    fireEvent.click(getByRole("tab", { name: "Mis tareas" }));

    expect(getByText("Sacar la basura")).toBeInTheDocument();
    expect(queryByText("Lavar platos")).not.toBeInTheDocument();
  });

  it("the Mis tareas tab overrides and disables the generic member dropdown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(null, 204)));

    const { getByRole, getByLabelText } = renderClient(
      {
        id: "cycle-1", starts_on: "2026-09-01", ends_on: "2026-09-28",
        seed: 1, seen: true, assignments: [assignment()],
      },
      { isAdmin: true },
    );

    fireEvent.click(getByRole("tab", { name: "Mis tareas" }));

    expect(getByLabelText("Ver")).toBeDisabled();
  });
});

describe("TareasClient — por día", () => {
  const cycle = (assignments: Assignment[]) => ({
    id: "cycle-1", starts_on: "2026-09-01", ends_on: "2026-12-31",
    seed: 1, seen: true, assignments,
  });

  it("opens only today's chores and folds every other day", () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(null, 204)));
    const { getByText, queryByText, getByRole } = renderClient(
      cycle([
        assignment({ id: "t", chore_name: "Barrer hoy" }),
        assignment({ id: "m", chore_name: "Trapear mañana", due_on: addDays(todayLocal(), 1) }),
        assignment({ id: "o", chore_name: "Cocinar atrasada", due_on: addDays(todayLocal(), -3) }),
      ]),
    );

    expect(getByText("Barrer hoy")).toBeInTheDocument();
    expect(queryByText("Trapear mañana")).not.toBeInTheDocument();
    expect(queryByText("Cocinar atrasada")).not.toBeInTheDocument();
    expect(getByRole("button", { name: /Hoy/ })).toHaveAttribute("aria-expanded", "true");
    expect(getByRole("button", { name: /Mañana/ })).toHaveAttribute("aria-expanded", "false");
    expect(getByRole("button", { name: /Atrasadas/ })).toHaveTextContent("1 tarea");
  });

  it("unfolds another day when its header is tapped", () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(null, 204)));
    const { getByText, getByRole } = renderClient(
      cycle([
        assignment({ id: "t", chore_name: "Barrer hoy" }),
        assignment({ id: "m", chore_name: "Trapear mañana", due_on: addDays(todayLocal(), 1) }),
      ]),
    );

    fireEvent.click(getByRole("button", { name: /Mañana/ }));

    expect(getByText("Trapear mañana")).toBeInTheDocument();
  });
});
