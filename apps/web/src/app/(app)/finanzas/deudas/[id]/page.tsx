import { DebtDetailPage } from "@/components/finance/DebtDetailPage";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function DebtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col">
      <PageHeader />
      <DebtDetailPage debtId={id} />
    </div>
  );
}
