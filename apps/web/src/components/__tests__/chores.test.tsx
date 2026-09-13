import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssignmentRow, type Assignment } from "../chores/AssignmentRow";
import { EffortBalanceBar } from "../chores/EffortBalanceBar";

const assignment: Assignment = {
  id: "1",
  chore_id: "c1",
  chore_name: "Sacar la basura",
  member_id: "m1",
  member_name: "Daniel",
  due_on: "2026-09-03",
  status: "pending",
  effort_points: 1,
  completed_at: null,
  completed_by_member_id: null,
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
});

describe("EffortBalanceBar", () => {
  const rows = [
    { member_id: "1", display_name: "Daniel", effort_points: 34,
      completed_count: 11, pending_count: 2 },
    { member_id: "2", display_name: "Papá", effort_points: 31,
      completed_count: 7, pending_count: 1 },
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
});
