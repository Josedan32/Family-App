"use client";

import { useQuery } from "@tanstack/react-query";

import { clientFetch } from "@/lib/api/client";

import { GoalCard, type Goal } from "./GoalCard";
import { GoalDetail } from "./GoalDetail";

/** A savings goal's own page: its progress on top, deposits and actions below. */
export function GoalDetailPage({ goalId }: { goalId: string }) {
  // Under "savings-goals" so every deposit, withdrawal or "usada" refreshes it.
  const goal = useQuery({
    queryKey: ["savings-goals", goalId],
    queryFn: () => clientFetch<Goal>(`/me/savings-goals/${goalId}`),
  });

  if (goal.isLoading) {
    return <div className="h-48 animate-pulse rounded-2xl bg-surface-sunken" />;
  }
  if (!goal.data) {
    return <p className="text-sm text-text-muted">No encontramos esta meta.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <GoalCard goal={goal.data} />
      <GoalDetail goal={goal.data} activityOpen />
    </div>
  );
}
