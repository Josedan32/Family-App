"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

interface Member {
  id: string;
  display_name: string;
}

export function EffortAdjustmentForm({ members }: { members: Member[] }) {
  const router = useRouter();
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [points, setPoints] = useState(0);
  const [reason, setReason] = useState("");

  const create = useMutation({
    mutationFn: () =>
      clientFetch("/effort-adjustments", {
        method: "POST",
        body: JSON.stringify({ member_id: memberId, points, reason }),
      }),
    onSuccess: async () => {
      router.refresh();
      pushToast({ message: "Ajuste registrado", type: "success" });
      setPoints(0);
      setReason("");
    },
  });

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Ajuste manual de esfuerzo
      </h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-muted">Miembro</span>
          <select
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
            className="min-h-[52px] rounded-xl border border-border bg-surface px-3.5 text-base"
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.display_name}
              </option>
            ))}
          </select>
        </label>

        <Input
          label="Puntos"
          type="number"
          value={points}
          onChange={(event) => setPoints(Number(event.target.value))}
        />

        <Input
          label="Motivo"
          required
          helperText="Un ajuste sin explicación es indistinguible del favoritismo."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />

        <Button type="submit" disabled={create.isPending || points === 0 || !reason.trim()}>
          {create.isPending ? "Guardando…" : "Registrar ajuste"}
        </Button>
      </form>
    </Card>
  );
}
