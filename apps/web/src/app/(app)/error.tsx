"use client";

import { useEffect } from "react";

import { IconAlertCircle } from "@/components/ui/Icons";
import { pushToast } from "@/lib/toast";

/**
 * Safety net for every Server Component read in this route group. Without
 * this boundary, an uncaught ApiError (a 404 on a deleted member, a 500, a
 * network blip) renders as Next's raw error overlay — indistinguishable from
 * a build failure to the viewer, and never reaches the toast bus, since
 * pushToast only fires once a client is listening.
 */
export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    pushToast({ message: error.message || "Ocurrió un error", type: "danger" });
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="text-danger">
        <IconAlertCircle />
      </span>
      <p className="text-sm font-medium text-text-muted">
        No se pudo cargar esta pantalla.
      </p>
      <button
        onClick={reset}
        className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold"
      >
        Reintentar
      </button>
    </div>
  );
}
