"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { clientFetch } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { pushToast } from "@/lib/toast";

type Mode = "create" | "join";

const SUBTITLES: Record<Mode, string> = {
  create: "Todavía no perteneces a ninguno. Crea uno o únete al de tu familia.",
  join: "Pídele el código a quien administra el hogar.",
};

const CODE_LENGTH = 8;

export default function OnboardingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        await clientFetch("/households", {
          method: "POST",
          body: JSON.stringify({ name }),
        });
      } else {
        await clientFetch("/households/join", {
          method: "POST",
          body: JSON.stringify({ code }),
        });
      }
      pushToast({
        message: mode === "create" ? "Hogar creado" : "Te uniste al hogar",
        type: "success",
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos completar la solicitud");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center gap-8 px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[2rem] font-bold tracking-tight">Tu hogar</h1>
        <p className="text-text-muted">{SUBTITLES[mode]}</p>
      </div>

      <Tabs
        tabs={[
          { id: "create", label: "Crear hogar" },
          { id: "join", label: "Unirme con código" },
        ]}
        active={mode}
        onChange={(id) => {
          setMode(id as Mode);
          setError(null);
        }}
      />

      <form onSubmit={submit} role="tabpanel" className="flex flex-col gap-6">
        {mode === "create" ? (
          <Input
            label="Nombre del hogar"
            type="text"
            placeholder="Familia Hernández"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            helperText="Serás el administrador de este hogar."
          />
        ) : (
          <Input
            label="Código del hogar"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, CODE_LENGTH))}
            aria-invalid={error ? true : undefined}
            className="text-center text-2xl font-bold tabular tracking-[0.22em] uppercase"
          />
        )}

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={busy}>
          {mode === "create" ? "Crear" : "Unirme"}
        </Button>
      </form>
    </main>
  );
}
