import type { Assignment } from "@/components/chores/AssignmentRow";

export interface AssignmentFilters {
  memberFilter: string;
  statusFilter: string;
  minPoints: number | null;
  maxPoints: number | null;
}

export const ALL_ASSIGNMENT_FILTERS: AssignmentFilters = {
  memberFilter: "all",
  statusFilter: "all",
  minPoints: null,
  maxPoints: null,
};

/** Pure so the filter bar's logic is testable without rendering the page. */
export function filterAssignments(
  assignments: Assignment[],
  filters: AssignmentFilters,
): Assignment[] {
  return assignments.filter((a) => {
    if (filters.memberFilter !== "all" && a.member_id !== filters.memberFilter) return false;
    if (filters.statusFilter !== "all" && a.status !== filters.statusFilter) return false;
    if (filters.minPoints !== null && a.effort_points < filters.minPoints) return false;
    if (filters.maxPoints !== null && a.effort_points > filters.maxPoints) return false;
    return true;
  });
}
