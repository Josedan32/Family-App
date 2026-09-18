import { describe, expect, it } from "vitest";

import type { Assignment } from "@/components/chores/AssignmentRow";

import { groupByDay } from "../(app)/tareas/groupByDay";

const chore = (id: string, due_on: string): Assignment => ({
  id,
  chore_id: "c",
  chore_name: id,
  chore_activities: [],
  chore_requirements: [],
  chore_expectation: null,
  member_id: "m1",
  member_name: "Daniel",
  member_photo_url: null,
  due_on,
  status: "pending",
  effort_points: 1,
  completed_at: null,
  completed_by_member_id: null,
});

const TODAY = "2026-09-18";

describe("groupByDay", () => {
  it("orders the days and names today and tomorrow", () => {
    const groups = groupByDay(
      [chore("c", "2026-09-20"), chore("a", "2026-09-18"), chore("b", "2026-09-19")],
      TODAY,
    );
    expect(groups.map((g) => g.label)).toEqual(["Hoy", "Mañana", "Domingo 20 sep"]);
    expect(groups.map((g) => g.tone)).toEqual(["today", "upcoming", "upcoming"]);
  });

  it("gathers every missed day into one group at the top", () => {
    const groups = groupByDay(
      [chore("hoy", "2026-09-18"), chore("x", "2026-09-02"), chore("y", "2026-09-10")],
      TODAY,
    );
    expect(groups[0]).toMatchObject({ key: "overdue", label: "Atrasadas", tone: "overdue" });
    expect(groups[0].assignments.map((a) => a.id)).toEqual(["x", "y"]);
    expect(groups[1].label).toBe("Hoy");
  });

  it("keeps several chores of the same day together", () => {
    const groups = groupByDay([chore("a", "2026-09-19"), chore("b", "2026-09-19")], TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].assignments).toHaveLength(2);
  });
});
