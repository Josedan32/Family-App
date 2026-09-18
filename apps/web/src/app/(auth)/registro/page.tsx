"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordStrength";
import { pushToast } from "@/lib/toast";

export default function RegistroPage() {
  return (
    <Suspense fallback={null}>
      <RegistroForm />
    </Suspense>
  );
}

function RegistroForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Carries a shared invite's code through signup, so she lands back on the
  // join form with it already filled in instead of typing it again.
  const code = searchParams.get("code");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const passwordReady = password.length >= MIN_PASSWORD_LENGTH;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "register", display_name: displayName, email, password }),
    });
    setBusy(false);
    if (!response.ok) {
      const problem = await response.json().catch(() => null);
      const message = problem?.title ?? "No pudimos crear la cuenta";
      setError(message);
      pushToast({ message, type: "danger" });
      return;
    }
    pushToast({ message: "Cuenta creada", type: "success" });
    router.push(code ? `/onboarding/hogar?code=${encodeURIComponent(code)}` : "/onboarding/hogar");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center gap-8 px-4">
      <div className="flex flex-col gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-brand text-base font-bold text-brand-contrast">
          FH
        </div>
        <h1 className="mt-2 text-[2rem] font-bold tracking-tight">Crear cuenta</h1>
        <p className="text-text-muted">Únete al hogar y empieza a registrar aportes.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <Input
            label="Nombre"
            type="text"
            autoComplete="name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            label="Correo"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordStrengthMeter password={password} />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-4">
          <Button type="submit" disabled={busy || !passwordReady}>
            {busy ? "Creando cuenta…" : "Registrarme"}
          </Button>
          <div className="flex justify-center text-sm">
            <a
              href={code ? `/login?code=${encodeURIComponent(code)}` : "/login"}
              className="font-semibold text-brand"
            >
              Ya tengo cuenta
            </a>
          </div>
        </div>
      </form>
    </main>
  );
}
