"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email, password }),
    });
    setBusy(false);
    if (!response.ok) {
      // One message for both a wrong password and an unknown email — never
      // reveals which field was wrong, or whether the account exists at all.
      setError("Correo o contraseña incorrectos");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center gap-8 px-4">
      <div className="flex flex-col gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-brand text-base font-bold text-brand-contrast">
          FH
        </div>
        <h1 className="mt-2 text-[2rem] font-bold tracking-tight">Family Hub</h1>
        <p className="text-text-muted">Las finanzas de la casa, en un solo lugar.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4.5">
        <div className="flex flex-col gap-3">
          <Input
            label="Correo"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
          <Input
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
        </div>
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-expense bg-surface-sunken p-3.5"
          >
            <span
              aria-hidden="true"
              className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border-2 border-expense text-sm font-bold text-expense"
            >
              !
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-expense">{error}</div>
              <div className="text-xs text-text-muted">
                Revisa los dos campos e inténtalo otra vez.
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-4">
          <Button type="submit" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </Button>
          <div className="flex justify-center gap-1.5 text-sm text-text-muted">
            <span>¿No tienes cuenta?</span>
            <a href="/registro" className="font-semibold text-brand">
              Crear cuenta
            </a>
          </div>
        </div>
      </form>
    </main>
  );
}
