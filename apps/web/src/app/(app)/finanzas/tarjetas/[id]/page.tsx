import { PageHeader } from "@/components/layout/PageHeader";

import { CardDetailPage } from "../CardDetailPage";

export default async function CreditCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col">
      <PageHeader />
      <CardDetailPage id={id} />
    </div>
  );
}
