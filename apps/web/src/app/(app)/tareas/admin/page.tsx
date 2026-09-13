import { pageFetch } from "@/lib/api/server";

import { ChoreAdminClient, type Chore } from "./ChoreAdminClient";
import { EffortAdjustmentForm } from "./EffortAdjustmentForm";

interface Member {
  id: string;
  display_name: string;
  status: string;
  role: string;
}

interface HouseholdDetail {
  my_role: string;
  members: Member[];
}

// Guests are never assigned chores (FR-M8-06), so they take no adjustment.
const ELIGIBLE_ROLES = ["admin", "adult", "teen"];

export default async function TareasAdminPage() {
  // FR-M8-15: chores carry no visibility rules — every member reads the same
  // catalog. Only mutation is gated to admins, here and by the API.
  const [chores, household] = await Promise.all([
    pageFetch<Chore[]>("/chores"),
    pageFetch<HouseholdDetail>("/households/current"),
  ]);
  const isAdmin = household.my_role === "admin";
  const eligibleMembers = household.members.filter(
    (member) => member.status === "active" && ELIGIBLE_ROLES.includes(member.role),
  );

  return (
    <div className="flex flex-col gap-5 pb-20">
      <header className="flex flex-col gap-1">
        <h1 className="text-[1.75rem] font-bold tracking-tight">Administrar tareas</h1>
        <p className="text-sm text-text-muted">
          {chores.length} tareas · ordenadas de menor a mayor esfuerzo
        </p>
      </header>

      <ChoreAdminClient chores={chores} isAdmin={isAdmin} />

      {isAdmin ? <EffortAdjustmentForm members={eligibleMembers} /> : null}
    </div>
  );
}
