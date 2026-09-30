import { PageHeader } from "@/components/layout/PageHeader";

import { CardsPanel } from "./CardsPanel";

export default function CreditCardsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader />
      <h1 className="text-2xl font-bold tracking-tight">Tarjetas de crédito</h1>
      <CardsPanel />
    </div>
  );
}
