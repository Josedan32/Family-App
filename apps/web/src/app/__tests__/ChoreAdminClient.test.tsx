import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChoreAdminClient, type Chore } from "../(app)/tareas/admin/ChoreAdminClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const chores: Chore[] = [
  {
    id: "1", name: "Sacar la basura", description: null,
    frequency: "daily", effort_points: 1,
    activities: [], requirements: [], expectation: null,
    applies_to_all: false,
    archived_at: null,
  },
  {
    id: "2", name: "Limpiar baño", description: null,
    frequency: "weekly", effort_points: 7,
    activities: ["Sanitario", "Lavamanos"],
    requirements: ["Guantes"],
    expectation: "Sin manchas.",
    applies_to_all: false,
    archived_at: null,
  },
  {
    id: "3", name: "Tender la cama", description: null,
    frequency: "daily", effort_points: 1,
    activities: [], requirements: [], expectation: null,
    applies_to_all: true,
    archived_at: null,
  },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function renderClient(isAdmin: boolean) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ChoreAdminClient chores={chores} isAdmin={isAdmin} />
    </QueryClientProvider>,
  );
}

describe("ChoreAdminClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows every chore with its effort points", () => {
    renderClient(true);
    expect(screen.getByText("Sacar la basura")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("lets a non-admin see the list but never edit it", () => {
    renderClient(false);
    expect(screen.getByText("Sacar la basura")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Los puntos de esfuerzo los define el administrador del hogar. Puedes consultarlos, no cambiarlos.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Nueva tarea")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sacar la basura/ })).not.toBeInTheDocument();
  });

  it("opens the edit sheet prefilled when an admin taps a chore", () => {
    renderClient(true);
    fireEvent.click(screen.getByRole("button", { name: /Sacar la basura/ }));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Sacar la basura");
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "1");
  });

  it("creates a chore with the exact shape the API expects", async () => {
    // The body is captured and asserted AFTER the await, never inside the mock:
    // an assertion that throws in there only rejects the fetch, and the test
    // still passes because the mock was called.
    let sent: unknown = null;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      sent = init?.body ? JSON.parse(init.body as string) : null;
      return jsonResponse({ id: "3", ...(sent as object) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderClient(true);
    fireEvent.click(screen.getByLabelText("Nueva tarea"));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Pasear al perro" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent).toEqual({
      name: "Pasear al perro",
      description: "",
      frequency: "weekly",
      effort_points: 5,
      activities: [],
      requirements: [],
      expectation: "",
      applies_to_all: false,
    });
  });

  it("shows a badge for a chore that applies to everyone", () => {
    renderClient(true);
    expect(screen.getByText(/Para todos/)).toBeInTheDocument();
  });

  it("sends applies_to_all when the admin checks the toggle", async () => {
    let sent: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        sent = init?.body ? JSON.parse(init.body as string) : {};
        return jsonResponse({ id: "4", ...sent });
      }),
    );

    renderClient(true);
    fireEvent.click(screen.getByLabelText("Nueva tarea"));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Lavar su plato" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Aplica para todos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(sent.applies_to_all).toBe(true));
  });

  it("sends the catalogue the admin typed", async () => {
    let sent: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        sent = init?.body ? JSON.parse(init.body as string) : {};
        return jsonResponse({ id: "3", ...sent });
      }),
    );

    renderClient(true);
    fireEvent.click(screen.getByLabelText("Nueva tarea"));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Regar plantas" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir paso" }));
    fireEvent.change(screen.getByLabelText("Pasos 1"), { target: { value: "Llenar la regadera" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir insumo" }));
    fireEvent.change(screen.getByLabelText("Necesitas 1"), { target: { value: "Regadera" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(sent.name).toBe("Regar plantas"));
    expect(sent.activities).toEqual(["Llenar la regadera"]);
    expect(sent.requirements).toEqual(["Regadera"]);
  });

  it("shows the duplicate name error inline, not a generic message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { type: "duplicate_chore", title: "Ya existe una tarea con ese nombre", status: 409 },
          409,
        ),
      ),
    );
    renderClient(true);
    fireEvent.click(screen.getByLabelText("Nueva tarea"));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Trapear" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya existe una tarea con ese nombre.",
    );
  });

  it("archives a chore through delete from the edit sheet", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/chores/2");
      expect(init?.method).toBe("DELETE");
      return { ok: true, status: 204, json: async () => null };
    });
    vi.stubGlobal("fetch", fetchMock);

    renderClient(true);
    fireEvent.click(screen.getByRole("button", { name: /Limpiar baño/ }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar tarea" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
