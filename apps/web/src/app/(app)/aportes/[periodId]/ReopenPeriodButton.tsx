"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

/**
 * `services/contributions.py::reopen_period` requires admin, and refuses to
 * reopen a period while a *different* period is already open — that other
 * period must be closed first (`409 period_already_open`).
 */
export function ReopenPeriodButton({
  periodId,
  isAdmin,
  status,
}: {
  periodId: string;
  isAdmin: boolean;
  status: string;
}) {
  const router = useRouter();

  const reopen = useMutation({
    mutationFn: () =>
      clientFetch(`/contribution-periods/${periodId}/reopen`, { method: "POST" }),
    onSuccess: () => {
      pushToast({ message: "Periodo reabierto", type: "success" });
      router.refresh();
    },
    onError: (error: unknown) => {
      pushToast({
        message:
          error instanceof Error && error.message
            ? error.message
            : "No se pudo reabrir el periodo",
        type: "danger",
      });
    },
  });

  const alreadyOpen = status === "open";
  const disabled = alreadyOpen || !isAdmin || reopen.isPending;
  const disabledReason = alreadyOpen
    ? "Este periodo ya está abierto"
    : !isAdmin
      ? "Solo un administrador puede reabrir el periodo"
      : undefined;

  return (
    <Button
      variant="secondary"
      onClick={() => reopen.mutate()}
      disabled={disabled}
      disabledReason={disabledReason}
    >
      {reopen.isPending ? "Reabriendo…" : "Reabrir periodo"}
    </Button>
  );
}
