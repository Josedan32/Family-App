import { ApiError } from "@/lib/api/errors";
import { pageFetch } from "@/lib/api/server";
import type { CreditCard, CreditCardSummary } from "@/lib/creditCards";
import { todayIn } from "@/lib/dates";

import { MemberCards, toMemberCardsState } from "./MemberCards";

interface HouseholdDetail {
  members: { id: string; display_name: string }[];
}

async function memberCards(id: string): Promise<CreditCard[] | CreditCardSummary | null> {
  try {
    return await pageFetch<CreditCard[] | CreditCardSummary>(`/members/${id}/credit-cards`);
  } catch (error) {
    // A denial is expected and normal here — it is the privacy model working.
    if (error instanceof ApiError && error.type === "not_visible") return null;
    throw error;
  }
}

export default async function MemberCardsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [household, result] = await Promise.all([
    pageFetch<HouseholdDetail>("/households/current"),
    memberCards(id),
  ]);
  const memberName = household.members.find((member) => member.id === id)?.display_name ?? "—";
  const view = toMemberCardsState(result);

  return view.state === "detail" ? (
    <MemberCards
      state="detail"
      memberId={id}
      memberName={memberName}
      cards={view.cards}
      today={todayIn("America/Bogota")}
    />
  ) : view.state === "summary" ? (
    <MemberCards state="summary" memberId={id} memberName={memberName} summary={view.summary} />
  ) : (
    <MemberCards state="private" memberId={id} memberName={memberName} />
  );
}
