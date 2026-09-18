import type { Assignment } from "@/components/chores/AssignmentRow";
import { addDays, weekdayDayMonth } from "@/lib/dates";

export interface DayGroup {
  key: string;
  label: string;
  tone: "overdue" | "today" | "upcoming";
  assignments: Assignment[];
}

/**
 * Pending chores in date order, one group per day. Everything already past
 * its day collapses into a single "Atrasadas" group at the top: a family
 * with a week of missed chores needs one warning, not seven headers.
 */
export function groupByDay(assignments: Assignment[], today: string): DayGroup[] {
  const sorted = [...assignments].sort((a, b) => a.due_on.localeCompare(b.due_on));
  const tomorrow = addDays(today, 1);
  const groups: DayGroup[] = [];

  for (const assignment of sorted) {
    const overdue = assignment.due_on < today;
    const key = overdue ? "overdue" : assignment.due_on;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        label: overdue
          ? "Atrasadas"
          : assignment.due_on === today
            ? "Hoy"
            : assignment.due_on === tomorrow
              ? "Mañana"
              : weekdayDayMonth(assignment.due_on),
        tone: overdue ? "overdue" : assignment.due_on === today ? "today" : "upcoming",
        assignments: [],
      };
      groups.push(group);
    }
    group.assignments.push(assignment);
  }
  return groups;
}
