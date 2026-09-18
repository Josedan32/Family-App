import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssignmentRow, type Assignment } from "../chores/AssignmentRow";
import { EffortBalanceBar } from "../chores/EffortBalanceBar";

const assignment: Assignment = {
  id: "1",
  chore_id: "c1",
  chore_name: "Sacar la basura",
  chore_activities: [],
  chore_requirements: [],
  chore_expectation: null,
  member_id: "m1",
  member_name: "Daniel",
  member_photo_url: null,
  due_on: "2026-09-03",
  status: "pending",
  effort_points: 1,
  completed_at: null,
  completed_by_member_id: null,
};

const withCatalogue: Assignment = {
  ...assignment,
  id: "2",
  chore_name: "Limpiar baño",
  chore_activities: ["Sanitario", "Lavamanos", "Espejo"],
  chore_requirements: ["Guantes", "Cloro"],
  chore_expectation: "Sin manchas y con el espejo seco.",
  effort_points: 7,
};

describe("AssignmentRow", () => {
  it("shows the chore and who it fell to", () => {
    render(<AssignmentRow assignment={assignment} />);
    expect(screen.getByText("Sacar la basura")).toBeInTheDocument();
    expect(screen.getByText("Daniel")).toBeInTheDocument();
  });

  it("shows the effort weight, since it is the whole mechanism", () => {
    render(<AssignmentRow assignment={assignment} />);
    expect(screen.getByText("1 pt")).toBeInTheDocument();
  });

  it("uses the plural for weights above one", () => {
    render(
      <AssignmentRow
        assignment={{ ...assignment, chore_name: "Limpiar baño", effort_points: 7 }}
      />,
    );
    expect(screen.getByText("7 pts")).toBeInTheDocument();
  });

  it("shows the Spanish status", () => {
    render(<AssignmentRow assignment={{ ...assignment, status: "done" }} />);
    expect(screen.getByText("Hecha")).toBeInTheDocument();
  });

  it("lets any member hand the chore to someone else", () => {
    const onReassign = vi.fn();
    render(
      <AssignmentRow
        assignment={assignment}
        members={[
          { id: "m1", display_name: "Daniel" },
          { id: "m2", display_name: "Papá" },
        ]}
        onReassign={onReassign}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Reasignar/ }));
    fireEvent.change(screen.getByLabelText("Reasignar a"), { target: { value: "m2" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onReassign).toHaveBeenCalledWith("1", "m2");
  });

  it("does not offer to reassign with fewer than two members", () => {
    render(
      <AssignmentRow
        assignment={assignment}
        members={[{ id: "m1", display_name: "Daniel" }]}
        onReassign={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Reasignar/ })).not.toBeInTheDocument();
  });
});

describe("EffortBalanceBar", () => {
  const rows = [
    { member_id: "1", display_name: "Daniel", effort_points: 34,
      completed_count: 11, pending_count: 2, absent_until: null },
    { member_id: "2", display_name: "Papá", effort_points: 31,
      completed_count: 7, pending_count: 1, absent_until: null },
  ];

  it("lists every member with their points", () => {
    render(<EffortBalanceBar rows={rows} />);
    expect(screen.getByText("Daniel")).toBeInTheDocument();
    expect(screen.getByText("34 pts")).toBeInTheDocument();
  });

  it("never renders a PrivateBlock", () => {
    // FR-M8-15: chores carry no visibility rules at all.
    const { container } = render(<EffortBalanceBar rows={rows} />);
    expect(container.textContent).not.toContain("Privado");
  });

  it("scales bars against the highest balance, not against 100", () => {
    render(<EffortBalanceBar rows={rows} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars[0]).toHaveAttribute("aria-valuemax", "34");
  });

  it("shows an absent member's return date instead of the counts", () => {
    render(
      <EffortBalanceBar rows={[{ ...rows[1], absent_until: "2026-09-20" }]} />,
    );
    expect(screen.getByText("Ausente hasta el 20 sep")).toBeInTheDocument();
    expect(screen.queryByText(/pendientes/)).not.toBeInTheDocument();
  });

  it("greys out an absent member's bar instead of colouring it", () => {
    const { container } = render(
      <EffortBalanceBar rows={[{ ...rows[0], absent_until: "2026-09-20" }]} />,
    );
    expect(container.querySelector(".bg-brand")).not.toBeInTheDocument();
  });
});

describe("AssignmentRow · catálogo", () => {
  it("does not offer a detail toggle when the chore has no catalogue", () => {
    render(<AssignmentRow assignment={assignment} />);
    expect(screen.queryByRole("button", { name: /detalle/i })).toBeNull();
  });

  it("shows requirements, steps and the definition of done", () => {
    render(<AssignmentRow assignment={withCatalogue} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));

    expect(screen.getByText("Guantes · Cloro")).toBeInTheDocument();
    expect(screen.getByText("Sanitario")).toBeInTheDocument();
    expect(
      screen.getByText("Sin manchas y con el espejo seco."),
    ).toBeInTheDocument();
  });

  it("remembers which steps are ticked, per device", () => {
    window.localStorage.clear();
    const { unmount } = render(<AssignmentRow assignment={withCatalogue} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));
    fireEvent.click(screen.getByLabelText("Lavamanos"));
    unmount();

    render(<AssignmentRow assignment={withCatalogue} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));
    expect(screen.getByLabelText("Lavamanos")).toBeChecked();
    expect(screen.getByLabelText("Espejo")).not.toBeChecked();
  });

  it("still works when localStorage throws", () => {
    // Private browsing, or storage disabled. The checklist should stop
    // remembering, not take the page down with it.
    const broken = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const brokenSet = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });

    render(<AssignmentRow assignment={withCatalogue} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));
    expect(() => fireEvent.click(screen.getByLabelText("Espejo"))).not.toThrow();
    expect(screen.getByLabelText("Espejo")).toBeChecked();

    broken.mockRestore();
    brokenSet.mockRestore();
  });
});
