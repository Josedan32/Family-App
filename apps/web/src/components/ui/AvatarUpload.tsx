"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { clientFetch } from "@/lib/api/client";
import {
  isDataUrlTooLarge,
  isSupportedImageFile,
  resizeImageToDataUrl,
} from "@/lib/avatarImage";
import { pushToast } from "@/lib/toast";

import { Avatar } from "./Avatar";
import { Button } from "./Button";

interface Props {
  displayName: string;
  photoUrl: string | null;
  onUpdated: (photoUrl: string) => void;
}

export function AvatarUpload({ displayName, photoUrl, onUpdated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!isSupportedImageFile(file)) {
        throw new Error("not_an_image");
      }
      const dataUrl = await resizeImageToDataUrl(file);
      if (isDataUrlTooLarge(dataUrl)) {
        throw new Error("too_large");
      }
      await clientFetch("/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ photo_url: dataUrl }),
      });
      return dataUrl;
    },
    onSuccess: (dataUrl) => {
      setError(null);
      onUpdated(dataUrl);
      pushToast({ message: "Foto actualizada", type: "success" });
    },
    onError: (err: unknown) => {
      setError(
        err instanceof Error && err.message === "not_an_image"
          ? "Selecciona un archivo de imagen"
          : err instanceof Error && err.message === "too_large"
            ? "La imagen sigue siendo muy grande, prueba con otra"
            : "No se pudo actualizar la foto",
      );
    },
  });

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    upload.mutate(file);
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar displayName={displayName} photoUrl={photoUrl} size="lg" />
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="secondary"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? "Subiendo…" : "Editar foto"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Editar foto"
          onChange={handleFileChange}
        />
        {error ? (
          <span role="alert" className="text-xs text-danger">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
