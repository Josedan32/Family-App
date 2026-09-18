import type { HouseholdExpense } from "@/components/finance/HouseholdExpenseRow";
import { PotBalanceCard } from "@/components/finance/PotBalanceCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconWallet } from "@/components/ui/Icons";
import { pageFetch } from "@/lib/api/server";

import { HouseholdExpenseList } from "./HouseholdExpenseList";
import { NewExpenseButton } from "./NewExpenseButton";

interface Pot {
  collected_minor: number;
  spent_minor: number;
  balance_minor: number;
  currency: string;
}

export default async function HouseholdLedgerPage() {
  // Server Component: no visibility rules apply here at all (FR-M4-15) — the
  // household ledger is shared money, never wrapped in PrivateBlock.
  const [pot, expenses] = await Promise.all([
    pageFetch<Pot>("/household-expenses/pot"),
    pageFetch<HouseholdExpense[]>("/household-expenses"),
  ]);

  return (
    <div className="relative flex flex-col gap-4">
      <h1 className="text-[1.75rem] font-bold tracking-tight">Gastos del hogar</h1>

      <PotBalanceCard
        collectedMinor={pot.collected_minor}
        spentMinor={pot.spent_minor}
        balanceMinor={pot.balance_minor}
        currency={pot.currency}
      />

      {expenses.length ? (
        <HouseholdExpenseList expenses={expenses} />
      ) : (
        <EmptyState
          icon={<IconWallet />}
          message="Aún no hay gastos del hogar"
        />
      )}

      <NewExpenseButton currency={pot.currency} potBalanceMinor={pot.balance_minor} />
    </div>
  );
}
