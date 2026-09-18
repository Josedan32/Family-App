"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

/**
 * `services/contributions.py::close_period` requires only that the actor be
 * an admin (`require_admin`) — there is no other eligibility check, and no
 * reopen endpoint exists. The disabled reasons below state exactly that
 * rule, not an invented one.
 */
export function ClosePeriodButton({
  periodId,
  isAdmin,
  status,
}: {
  periodId: string;
  isAdmin: boolean;
  status: string;
}) {
  const router = useRouter();

  const close = useMutation({
    mutationFn: () =>
      clientFetch(`/contribution-periods/${periodId}/close`, { method: "POST" }),
    onSuccess: () => {
      pushToast({ message: "Periodo cerrado", type: "success" });
      router.refresh();
    },
  });

  const alreadyClosed = status === "closed";
  const disabled = alreadyClosed || !isAdmin || close.isPending;
  const disabledReason = alreadyClosed
    ? "Este periodo ya está cerrado"
    : !isAdmin
      ? "Solo un administrador puede cerrar el periodo"
      : undefined;

  return (
    <Button
      variant="secondary"
      onClick={() => close.mutate()}
      disabled={disabled}
      disabledReason={disabledReason}
    >
      {close.isPending ? "Cerrando…" : "Cerrar periodo"}
    </Button>
  );
}
