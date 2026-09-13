"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

function firstOfMonth(): string {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
}

function endOfMonth(): string {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export function GenerateCycleButton() {
  const router = useRouter();

  const generate = useMutation({
    mutationFn: () =>
      clientFetch("/chore-cycles", {
        method: "POST",
        body: JSON.stringify({ starts_on: firstOfMonth(), ends_on: endOfMonth() }),
      }),
    onSuccess: () => {
      pushToast({ message: "Ciclo generado", type: "success" });
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button
        onClick={() => generate.mutate()}
        disabled={generate.isPending}
        className="mt-1.5"
      >
        {generate.isPending ? "Generando…" : "Generar ciclo"}
      </Button>
      <span className="text-xs text-text-muted">Solo administrador</span>
    </div>
  );
}
