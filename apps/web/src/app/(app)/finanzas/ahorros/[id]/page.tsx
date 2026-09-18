import { GoalDetailPage } from "@/components/finance/GoalDetailPage";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col">
      <PageHeader />
      <GoalDetailPage goalId={id} />
    </div>
  );
}
