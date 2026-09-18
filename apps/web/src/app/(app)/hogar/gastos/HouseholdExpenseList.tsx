"use client";

import {
  HouseholdExpenseRow,
  type HouseholdExpense,
} from "@/components/finance/HouseholdExpenseRow";
import { HouseholdExpensesTable } from "@/components/finance/tables";
import { useViewMode } from "@/lib/viewMode";

/** Client-side only because the view mode lives on this device. */
export function HouseholdExpenseList({ expenses }: { expenses: HouseholdExpense[] }) {
  if (useViewMode() === "table") return <HouseholdExpensesTable expenses={expenses} />;
  return (
    <ul className="flex flex-col gap-2.5">
      {expenses.map((expense) => (
        <HouseholdExpenseRow key={expense.id} expense={expense} />
      ))}
    </ul>
  );
}
