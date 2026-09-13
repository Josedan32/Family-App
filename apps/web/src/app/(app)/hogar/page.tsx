import { Card } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api/server";

import { InvitesSection } from "./InvitesSection";

interface Member {
  id: string;
  display_name: string;
  photo_url: string | null;
  relationship: string | null;
  role: string;
  status: string;
  age: number | null;
}

interface HouseholdDetail {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  my_role: string;
  members: Member[];
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  adult: "Adulto",
  teen: "Adolescente",
  guest: "Invitado",
};

export default async function HogarPage() {
  const household = await apiFetch<HouseholdDetail>("/households/current");
  const isAdmin = household.my_role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[1.75rem] font-bold tracking-tight">{household.name}</h1>

      <div className="flex flex-col gap-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Miembros
        </h2>
        <Card className="flex flex-col divide-y divide-border p-0">
          {household.members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 p-3.5">
              <div
                aria-hidden="true"
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-border bg-surface-sunken text-sm font-bold text-text-muted"
              >
                {member.display_name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{member.display_name}</p>
                <p className="text-xs text-text-muted">
                  {member.relationship}
                  {member.age !== null ? ` · ${member.age} años` : ""}
                </p>
              </div>
              <span className="flex-none rounded-lg border border-brand bg-surface-sunken px-2 py-1 text-xs font-semibold text-brand">
                {ROLE_LABEL[member.role] ?? member.role}
              </span>
            </div>
          ))}
        </Card>
        <p className="text-xs text-text-muted">
          El rol define qué puede administrar cada quien. Ningún rol, incluido el de
          administrador, permite ver los movimientos privados de otro miembro.
        </p>
      </div>

      {isAdmin ? <InvitesSection /> : null}
    </div>
  );
}
