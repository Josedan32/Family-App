"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { clientFetch } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { pushToast } from "@/lib/toast";

interface Profile {
  display_name: string;
  photo_url: string | null;
  birth_date: string | null;
  age: number | null;
}

export function ProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [photoUrl, setPhotoUrl] = useState(initial.photo_url);
  const [birthDate, setBirthDate] = useState(initial.birth_date ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);

  const MIN_NEW_PASSWORD_LENGTH = 12;

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

  const changePassword = useMutation({
    mutationFn: () =>
      clientFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      }),
    onSuccess: () => {
      pushToast({ message: "Contraseña actualizada", type: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError(null);
    },
    onError: (error: unknown) => {
      setPasswordError(
        error instanceof ApiError && error.type === "incorrect_password"
          ? error.message
          : null,
      );
    },
  });

  function submitPasswordChange() {
    setPasswordError(null);
    if (newPassword.length < MIN_NEW_PASSWORD_LENGTH) {
      setNewPasswordError(
        `La contraseña debe tener al menos ${MIN_NEW_PASSWORD_LENGTH} caracteres`,
      );
      return;
    }
    setNewPasswordError(null);
    if (newPassword !== confirmPassword) {
      setConfirmError("Las contraseñas no coinciden");
      return;
    }
    setConfirmError(null);
    changePassword.mutate();
  }

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
      <AvatarUpload
        displayName={displayName}
        photoUrl={photoUrl}
        onUpdated={setPhotoUrl}
      />

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

      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <h2 className="text-lg font-semibold">Cambiar contraseña</h2>
        <Input
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          error={passwordError ?? undefined}
        />
        <Input
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          error={newPasswordError ?? undefined}
        />
        <Input
          label="Confirmar contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={confirmError ?? undefined}
        />
        <Button
          variant="secondary"
          onClick={submitPasswordChange}
          disabled={
            changePassword.isPending || !currentPassword || !newPassword || !confirmPassword
          }
        >
          {changePassword.isPending ? "Actualizando…" : "Actualizar contraseña"}
        </Button>
      </div>

      <Button variant="secondary" onClick={() => logout.mutate()} disabled={logout.isPending}>
        {logout.isPending ? "Saliendo…" : "Cerrar sesión"}
      </Button>
    </div>
  );
}
