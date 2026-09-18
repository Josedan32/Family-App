"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PledgesEditor, pledgesPayload, type Pledges } from "@/components/finance/PledgesEditor";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

interface PledgedMember {
  member_id: string;
  display_name: string;
  pledged_minor: number;
}

function currentPledges(members: PledgedMember[]): Pledges {
  return Object.fromEntries(members.map((m) => [m.member_id, m.pledged_minor]));
}

export function EditPledgesButton({
  periodId,
  currency,
  members,
}: {
  periodId: string;
  currency: string;
  members: PledgedMember[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pledges, setPledges] = useState<Pledges>(() => currentPledges(members));
  const editorMembers = members.map((m) => ({ id: m.member_id, display_name: m.display_name }));

  const save = useMutation({
    mutationFn: () =>
      clientFetch(`/contribution-periods/${periodId}/pledges`, {
        method: "PUT",
        body: JSON.stringify({ pledges: pledgesPayload(editorMembers, pledges) }),
      }),
    onSuccess: () => {
      pushToast({ message: "Cuotas actualizadas", type: "success" });
      setOpen(false);
      router.refresh();
    },
  });

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setPledges(currentPledges(members));
          setOpen(true);
        }}
      >
        Editar cuotas
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Cuotas del periodo">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <PledgesEditor
            members={editorMembers}
            value={pledges}
            onChange={setPledges}
            currency={currency}
          />
          {save.isError ? (
            <p role="alert" className="text-sm text-danger">
              {(save.error as Error).message}
            </p>
          ) : null}
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Guardando…" : "Guardar cuotas"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
