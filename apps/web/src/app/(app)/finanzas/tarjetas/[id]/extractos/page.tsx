import { PageHeader } from "@/components/layout/PageHeader";

import { StatementsHistoryPage } from "../../StatementsHistoryPage";

export default async function CreditCardStatementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col">
      <PageHeader />
      <StatementsHistoryPage id={id} />
    </div>
  );
}
