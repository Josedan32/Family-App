"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Sheet } from "@/components/ui/Sheet";
import { clientFetch } from "@/lib/api/client";

export function ContributeButton({
  periodId,
  currency,
}: {
  periodId: string;
  currency: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const contribute = useMutation({
    mutationFn: () =>
      clientFetch(`/contribution-periods/${periodId}/contributions`, {
        method: "POST",
        body: JSON.stringify({ amount_minor: amount, paid_on: paidOn, note: note || null }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setOpen(false);
      router.refresh();
    },
  });

  return (
    <>
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:static">
        <Button className="w-full" onClick={() => setOpen(true)}>
          Registrar mi aporte
        </Button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Registrar mi aporte">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            contribute.mutate();
          }}
        >
          <MoneyInput
            label="Monto"
            value={amount}
            onChange={setAmount}
            currency={currency}
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
            helperText="La nota la ven todos los miembros del hogar."
          />
          {contribute.isError ? (
            <p role="alert" className="text-sm text-danger">
              {(contribute.error as Error).message}
            </p>
          ) : null}
          <Button type="submit" disabled={contribute.isPending || amount <= 0}>
            {contribute.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
