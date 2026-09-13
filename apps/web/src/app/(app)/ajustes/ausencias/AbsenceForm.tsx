"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

export interface Absence {
  id: string;
  member_id: string;
  starts_on: string;
  ends_on: string;
  reason: string | null;
}

export function AbsenceForm({ initial }: { initial: Absence[] }) {
  const [absences, setAbsences] = useState(initial);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");

  const create = useMutation({
    mutationFn: () =>
      clientFetch<Absence>("/me/absences", {
        method: "POST",
        body: JSON.stringify({
          starts_on: startsOn,
          ends_on: endsOn,
          reason: reason.trim() || null,
        }),
      }),
    onSuccess: (created) => {
      pushToast({ message: "Ausencia registrada", type: "success" });
      setAbsences((current) => [...current, created]);
      setStartsOn("");
      setEndsOn("");
      setReason("");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => clientFetch(`/me/absences/${id}`, { method: "DELETE" }),
    onSuccess: (_result, id) => {
      pushToast({ message: "Ausencia eliminada", type: "info" });
      setAbsences((current) => current.filter((absence) => absence.id !== id));
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {absences.length ? (
        <ul className="flex flex-col gap-2">
          {absences.map((absence) => (
            <Card key={absence.id} className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">
                  {absence.starts_on} – {absence.ends_on}
                </span>
                {absence.reason ? (
                  <span className="text-xs text-text-muted">{absence.reason}</span>
                ) : null}
              </div>
              <Button
                variant="secondary"
                onClick={() => remove.mutate(absence.id)}
                disabled={remove.isPending}
              >
                Quitar
              </Button>
            </Card>
          ))}
        </ul>
      ) : null}

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Input
          label="Desde"
          type="date"
          required
          value={startsOn}
          onChange={(event) => setStartsOn(event.target.value)}
        />
        <Input
          label="Hasta"
          type="date"
          required
          value={endsOn}
          onChange={(event) => setEndsOn(event.target.value)}
        />
        <Input
          label="Motivo (opcional)"
          helperText="Opcional. Tu familia ve que no estás; el porqué es cosa tuya."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <Button type="submit" disabled={create.isPending || !startsOn || !endsOn}>
          {create.isPending ? "Guardando…" : "Guardar ausencia"}
        </Button>
      </form>
    </div>
  );
}
