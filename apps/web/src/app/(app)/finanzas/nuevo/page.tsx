"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { TransactionForm } from "@/components/finance/TransactionForm";
import { PageHeader } from "@/components/layout/PageHeader";

const TITLE = { income: "Registrar ingreso", expense: "Registrar gasto" } as const;
const CURRENCY = "COP";

export default function NewTransactionPage() {
  return (
    <Suspense fallback={null}>
      <NewTransactionForm />
    </Suspense>
  );
}

function NewTransactionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kind = searchParams.get("kind") === "income" ? "income" : "expense";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader />
      <h1 className="text-2xl font-bold">{TITLE[kind]}</h1>
      <TransactionForm
        kind={kind}
        currency={CURRENCY}
        onDone={() => {
          router.push(`/finanzas?tab=${kind}`);
          router.refresh();
        }}
      />
    </div>
  );
}
