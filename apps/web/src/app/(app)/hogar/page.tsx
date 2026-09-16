import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { IconWallet } from "@/components/ui/Icons";
import { pageFetch } from "@/lib/api/server";

import { InvitesSection } from "./InvitesSection";
import { MemberList, type Member } from "./MemberList";

interface HouseholdDetail {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  my_role: string;
  my_member_id: string;
  members: Member[];
}

export default async function HogarPage() {
  const household = await pageFetch<HouseholdDetail>("/households/current");
  const isAdmin = household.my_role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[1.75rem] font-bold tracking-tight">{household.name}</h1>

      <Link href="/hogar/gastos">
        <Card className="flex items-center gap-3">
          <span aria-hidden="true" className="flex-none text-brand">
            <IconWallet />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Gastos del hogar</p>
            <p className="text-xs text-text-muted">El libro contable del pozo común</p>
          </div>
        </Card>
      </Link>

      <div className="flex flex-col gap-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Miembros
        </h2>
        <MemberList
          members={household.members}
          isAdmin={isAdmin}
          myMemberId={household.my_member_id}
        />
      </div>

      {isAdmin ? <InvitesSection /> : null}
    </div>
  );
}
