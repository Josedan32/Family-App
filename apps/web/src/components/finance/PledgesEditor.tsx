"use client";

import { MoneyInput } from "@/components/ui/MoneyInput";

export interface PledgeMember {
  id: string;
  display_name: string;
}

/** Amount each member is expected to put into a period, keyed by member id. */
export type Pledges = Record<string, number>;

export function pledgesPayload(members: PledgeMember[], pledges: Pledges) {
  return members
    .filter((member) => (pledges[member.id] ?? 0) > 0)
    .map((member) => ({ member_id: member.id, expected_amount_minor: pledges[member.id] }));
}

/**
 * One amount field per member. Empty means "no quota" — that member is simply
 * left out of the set. Totals and what is still missing are computed by the
 * API and shown on the period itself, never added up here.
 */
export function PledgesEditor({
  members,
  value,
  onChange,
  currency,
}: {
  members: PledgeMember[];
  value: Pledges;
  onChange: (next: Pledges) => void;
  currency: string;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Cuota de cada miembro (opcional)
      </legend>
      {members.map((member) => (
        <MoneyInput
          key={member.id}
          label={member.display_name}
          value={value[member.id] ?? 0}
          onChange={(amount) => onChange({ ...value, [member.id]: amount })}
          currency={currency}
        />
      ))}
    </fieldset>
  );
}
