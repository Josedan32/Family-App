import { describe, expect, it } from "vitest";

import type { Assignment } from "@/components/chores/AssignmentRow";

import {
  ALL_ASSIGNMENT_FILTERS,
  filterAssignments,
} from "../(app)/tareas/filterAssignments";

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
    due_on: "2026-09-03",
    status: "pending",
    effort_points: 3,
    completed_at: null,
    completed_by_member_id: null,
    ...over,
  };
}

describe("filterAssignments", () => {
  it("returns everything when no filter is active", () => {
    const rows = [assignment({ id: "a1" }), assignment({ id: "a2" })];
    expect(filterAssignments(rows, ALL_ASSIGNMENT_FILTERS)).toEqual(rows);
  });

  it("filters by member", () => {
    const rows = [
      assignment({ id: "a1", member_id: "m1" }),
      assignment({ id: "a2", member_id: "m2" }),
    ];
    const result = filterAssignments(rows, { ...ALL_ASSIGNMENT_FILTERS, memberFilter: "m2" });
    expect(result.map((a) => a.id)).toEqual(["a2"]);
  });

  it("filters by status", () => {
    const rows = [
      assignment({ id: "a1", status: "pending" }),
      assignment({ id: "a2", status: "done" }),
      assignment({ id: "a3", status: "skipped" }),
    ];
    const result = filterAssignments(rows, { ...ALL_ASSIGNMENT_FILTERS, statusFilter: "done" });
    expect(result.map((a) => a.id)).toEqual(["a2"]);
  });

  it("filters by a minimum points threshold", () => {
    const rows = [
      assignment({ id: "a1", effort_points: 2 }),
      assignment({ id: "a2", effort_points: 5 }),
    ];
    const result = filterAssignments(rows, { ...ALL_ASSIGNMENT_FILTERS, minPoints: 4 });
    expect(result.map((a) => a.id)).toEqual(["a2"]);
  });

  it("filters by a maximum points threshold", () => {
    const rows = [
      assignment({ id: "a1", effort_points: 2 }),
      assignment({ id: "a2", effort_points: 5 }),
    ];
    const result = filterAssignments(rows, { ...ALL_ASSIGNMENT_FILTERS, maxPoints: 4 });
    expect(result.map((a) => a.id)).toEqual(["a1"]);
  });

  it("combines member, status and points filters with AND semantics", () => {
    const rows = [
      assignment({ id: "a1", member_id: "m1", status: "pending", effort_points: 3 }),
      assignment({ id: "a2", member_id: "m1", status: "done", effort_points: 3 }),
      assignment({ id: "a3", member_id: "m2", status: "pending", effort_points: 3 }),
      assignment({ id: "a4", member_id: "m1", status: "pending", effort_points: 8 }),
    ];
    const result = filterAssignments(rows, {
      memberFilter: "m1",
      statusFilter: "pending",
      minPoints: 1,
      maxPoints: 5,
    });
    expect(result.map((a) => a.id)).toEqual(["a1"]);
  });
});
