import { TransactionDetailView } from "@/components/finance/TransactionDetailView";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col">
      <PageHeader />
      <TransactionDetailView transactionId={id} />
    </div>
  );
}
