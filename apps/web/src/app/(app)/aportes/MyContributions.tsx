"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MoneyDisplay } from "@/components/finance/MoneyDisplay";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Sheet } from "@/components/ui/Sheet";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

interface OwnContribution {
  id: string;
  amount_minor: number;
  currency: string;
  paid_on: string;
  note: string | null;
}

function EditContributionSheet({
  contribution,
  onClose,
}: {
  contribution: OwnContribution;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [amount, setAmount] = useState(contribution.amount_minor);
  const [paidOn, setPaidOn] = useState(contribution.paid_on);
  const [note, setNote] = useState(contribution.note ?? "");

  const update = useMutation({
    mutationFn: () =>
      clientFetch(`/contributions/${contribution.id}`, {
        method: "PATCH",
        body: JSON.stringify({ amount_minor: amount, paid_on: paidOn, note: note || null }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["own-contributions"] });
      router.refresh();
      pushToast({ message: "Aporte actualizado", type: "success" });
      onClose();
    },
  });

  return (
    <Sheet open onClose={onClose} title="Editar aporte">
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate();
        }}
      >
        <MoneyInput
          label="Monto"
          value={amount}
          onChange={setAmount}
          currency={contribution.currency}
          kind="expense"
          required
        />
        <Input
          label="Fecha"
          type="date"
          required
          value={paidOn}
          onChange={(event) => setPaidOn(event.target.value)}
        />
        <Input
          label="Nota (opcional)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {update.isError ? (
          <p role="alert" className="text-sm text-danger">
            {(update.error as Error).message}
          </p>
        ) : null}
        <Button type="submit" disabled={update.isPending || amount <= 0}>
          {update.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>
    </Sheet>
  );
}

function ContributionRow({ contribution }: { contribution: OwnContribution }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const remove = useMutation({
    mutationFn: () => clientFetch(`/contributions/${contribution.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["own-contributions"] });
      router.refresh();
      pushToast({ message: "Aporte eliminado", type: "info" });
    },
  });

  return (
    <div className="flex items-center gap-3 p-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs tracking-wide text-text-muted">{contribution.paid_on}</span>
        {contribution.note ? (
          <span className="text-sm text-text-muted">{contribution.note}</span>
        ) : null}
      </div>
      <MoneyDisplay
        amountMinor={contribution.amount_minor}
        currency={contribution.currency}
        className="font-bold"
      />
      {confirmingDelete ? (
        <div className="flex flex-none items-center gap-1.5">
          <Button type="button" variant="secondary" onClick={() => setConfirmingDelete(false)}>
            No
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Sí
          </Button>
        </div>
      ) : (
        <div className="flex flex-none items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-semibold text-brand"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-sm font-semibold text-danger"
          >
            Eliminar
          </button>
        </div>
      )}

      {editing ? (
        <EditContributionSheet contribution={contribution} onClose={() => setEditing(false)} />
      ) : null}
    </div>
  );
}

export function MyContributions({ periodId }: { periodId: string }) {
  const contributions = useQuery({
    queryKey: ["own-contributions", periodId],
    queryFn: () => clientFetch<OwnContribution[]>(`/contribution-periods/${periodId}/contributions/mine`),
  });

  if (!contributions.data?.length) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="text-sm font-semibold">Mis aportes</h2>
      <Card className="flex flex-col divide-y divide-border p-0">
        {contributions.data.map((contribution) => (
          <ContributionRow key={contribution.id} contribution={contribution} />
        ))}
      </Card>
    </div>
  );
}
