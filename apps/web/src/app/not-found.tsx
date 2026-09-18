import Link from "next/link";

import { IconAlertCircle } from "@/components/ui/Icons";

/** Only for URLs that match no route. Every real route renders on the server,
 *  so reloading or opening one from a shared link never lands here. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-4 text-center">
      <span className="text-text-muted">
        <IconAlertCircle />
      </span>
      <h1 className="text-lg font-bold">Esta página no existe</h1>
      <p className="text-sm text-text-muted">
        Puede que el enlace esté mal escrito o que la página se haya movido.
      </p>
      <Link
        href="/"
        className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast active:bg-brand-pressed"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
