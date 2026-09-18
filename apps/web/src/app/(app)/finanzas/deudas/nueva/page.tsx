"use client";

import { useRouter } from "next/navigation";

import { DebtForm } from "@/components/finance/DebtForm";
import { PageHeader } from "@/components/layout/PageHeader";

export default function NewDebtPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader />
      <h1 className="text-2xl font-bold">Nueva deuda</h1>
      <DebtForm
        onDone={() => {
          router.push("/finanzas?tab=debts");
          router.refresh();
        }}
      />
    </div>
  );
}
