import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import type { Assignment } from "../chores/AssignmentRow";
import { ChoresTable } from "../chores/ChoresTable";

const assignment: Assignment = {
  id: "a1",
  chore_id: "c1",
  chore_name: "Limpiar baño",
  chore_activities: ["Sanitario", "Espejo"],
  chore_requirements: ["Guantes"],
  chore_expectation: null,
  member_id: "m1",
  member_name: "Daniel",
  member_photo_url: null,
  due_on: "2031-11-20",
  status: "pending",
  effort_points: 7,
  completed_at: null,
  completed_by_member_id: null,
};

describe("ChoresTable", () => {
  it("shows the chore, its points, and who and when underneath on a phone", () => {
    render(<ChoresTable caption="Esta semana" assignments={[assignment]} />);
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getByText("Limpiar baño")).toBeInTheDocument();
    expect(within(row).getByText("7 pts")).toBeInTheDocument();
    expect(within(row).getByText("Daniel · 20 nov")).toHaveClass("md:hidden");
    expect(screen.getByRole("columnheader", { name: "Quién" })).toHaveClass("hidden");
  });

  it("marks a pending chore done from its row", () => {
    const onComplete = vi.fn();
    render(
      <ChoresTable caption="Esta semana" assignments={[assignment]} onComplete={onComplete} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Marcar Limpiar baño como hecha" }));
    expect(onComplete).toHaveBeenCalledWith("a1");
  });

  it("says a finished chore is done instead of offering the button", () => {
    render(
      <ChoresTable
        caption="Hechas"
        assignments={[{ ...assignment, status: "done" }]}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Marcar/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Hecha").length).toBeGreaterThan(0);
  });

  it("unfolds the usual card, with its checklist, when the chore is tapped", () => {
    render(<ChoresTable caption="Esta semana" assignments={[assignment]} />);
    fireEvent.click(screen.getByRole("button", { name: "Limpiar baño" }));
    expect(screen.getByRole("button", { name: "Ver detalle" })).toBeInTheDocument();
  });
});
