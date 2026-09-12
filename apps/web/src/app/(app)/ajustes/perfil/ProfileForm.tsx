"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

interface Profile {
  display_name: string;
  birth_date: string | null;
  age: number | null;
}

export function ProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [birthDate, setBirthDate] = useState(initial.birth_date ?? "");

  const save = useMutation({
    mutationFn: () =>
      clientFetch("/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          display_name: displayName,
          birth_date: birthDate || null,
        }),
      }),
    onSuccess: () => pushToast({ message: "Perfil actualizado", type: "success" }),
  });

  const logout = useMutation({
    mutationFn: async () => {
      await fetch("/api/session", { method: "DELETE" });
    },
    onSuccess: () => {
      pushToast({ message: "Sesión cerrada", type: "info" });
      router.push("/login");
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Input
          label="Nombre"
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <Input
          label="Fecha de nacimiento"
          type="date"
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value)}
        />
        {initial.age !== null ? (
          <p className="text-sm text-text-muted">Edad: {initial.age} años</p>
        ) : null}
      </div>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "Guardando…" : "Guardar cambios"}
      </Button>

      <Button variant="secondary" onClick={() => logout.mutate()} disabled={logout.isPending}>
        {logout.isPending ? "Saliendo…" : "Cerrar sesión"}
      </Button>
    </div>
  );
}
