"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CategoryPicker } from "@/components/finance/CategoryPicker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Sheet } from "@/components/ui/Sheet";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

interface Category {
  id: string;
  name: string;
  kind: string;
  is_contribution_category: boolean;
}

const TODAY = () => new Date().toISOString().slice(0, 10);

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
  const [amountTouched, setAmountTouched] = useState(false);
  const [paidOn, setPaidOn] = useState(TODAY());
  const [dateTouched, setDateTouched] = useState(false);
  const [note, setNote] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);

  const categories = useQuery({
    queryKey: ["categories", "expense"],
    queryFn: () => clientFetch<Category[]>("/categories?kind=expense"),
  });

  const amountError =
    amountTouched && amount <= 0 ? "Ingresa un monto mayor a cero" : undefined;
  const dateError =
    dateTouched && (!paidOn || paidOn > TODAY())
      ? "La fecha no puede ser en el futuro"
      : undefined;
  const canSubmit = amount > 0 && !!paidOn && paidOn <= TODAY();

  const contribute = useMutation({
    mutationFn: () =>
      clientFetch(`/contribution-periods/${periodId}/contributions`, {
        method: "POST",
        body: JSON.stringify({
          amount_minor: amount,
          paid_on: paidOn,
          note: note || null,
          category_ids: categoryIds,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["monthly-summary"] });
      setOpen(false);
      setCategoryIds([]);
      pushToast({ message: "Aporte registrado", type: "success" });
      router.refresh();
    },
  });

  return (
    <>
      <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 md:static md:inset-x-auto">
        <Button className="w-full" onClick={() => setOpen(true)}>
          Registrar mi aporte
        </Button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Registrar mi aporte">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            setAmountTouched(true);
            setDateTouched(true);
            if (canSubmit) contribute.mutate();
          }}
        >
          <MoneyInput
            label="Monto"
            value={amount}
            onChange={setAmount}
            onBlur={() => setAmountTouched(true)}
            currency={currency}
            kind="expense"
            error={amountError}
            required
          />
          <Input
            label="Fecha"
            type="date"
            required
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
            onBlur={() => setDateTouched(true)}
            error={dateError}
          />
          <Input
            label="Nota (opcional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            helperText="La nota la ven todos los miembros del hogar."
          />
          <CategoryPicker
            categories={categories.data}
            mode="multi"
            value={categoryIds}
            onChange={setCategoryIds}
            label="Categorías (opcional, elige una o más)"
          />
          {contribute.isError ? (
            <p role="alert" className="text-sm text-danger">
              {(contribute.error as Error).message}
            </p>
          ) : null}
          <Button type="submit" disabled={contribute.isPending || !canSubmit}>
            {contribute.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
