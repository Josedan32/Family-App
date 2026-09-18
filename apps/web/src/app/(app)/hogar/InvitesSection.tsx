"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

/** `origin` is the app's own URL (`window.location.origin` at the call
 * site) so the link always points at wherever this build is actually
 * hosted, never a hardcoded domain. */
export function buildInviteLink(origin: string, code: string): string {
  return `${origin}/onboarding/hogar?code=${encodeURIComponent(code)}`;
}

export function buildShareMessage(code: string, origin: string): string {
  return `Únete a mi hogar con este código: ${code}\n${buildInviteLink(origin, code)}`;
}

interface Invite {
  id: string;
  code: string;
  role_granted: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  revoked_at: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  adult: "Adulto",
  teen: "Adolescente",
  guest: "Invitado",
};

// The mockup shows hour-based options, but CreateInviteRequest only accepts
// whole days (>= 1) — the plan predates that constraint.
const DURATIONS = [
  { label: "1 día", days: 1 },
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
];

function expiryLabel(invite: Invite) {
  if (invite.revoked_at) return "Revocado";
  return `${ROLE_LABEL[invite.role_granted] ?? invite.role_granted} · vence ${new Date(
    invite.expires_at,
  ).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    pushToast({ message: "Copiado", type: "success" });
    return true;
  } catch (error) {
    console.error("Failed to copy:", error);
    pushToast({ message: "Error al copiar", type: "danger" });
    return false;
  }
}

export async function handleShare(code: string, origin: string) {
  const message = buildShareMessage(code, origin);

  // Try Web Share API first
  if (navigator.share) {
    try {
      await navigator.share({
        text: message,
      });
      pushToast({ message: "Compartido", type: "success" });
      return;
    } catch (error) {
      const errorName = (error as Error).name;
      // User cancelled (AbortError) — do NOT fall through to wa.me
      if (errorName === "AbortError") {
        return;
      }
      // Share API failed for other reason, fall through to wa.me
      console.error("Share failed:", error);
    }
  }

  // Fall back to WhatsApp link
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
  const opened = window.open(whatsappUrl, "_blank");

  // If wa.me link was blocked (popup blocked), fall back to clipboard
  if (!opened) {
    await copyToClipboard(message);
  }
}

export function InvitesSection() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<"adult" | "teen" | "guest">("teen");
  const [days, setDays] = useState(7);

  const invites = useQuery({
    queryKey: ["invites"],
    queryFn: () => clientFetch<Invite[]>("/households/current/invites"),
  });

  const create = useMutation({
    mutationFn: () =>
      clientFetch("/households/current/invites", {
        method: "POST",
        body: JSON.stringify({ role_granted: role, expires_in_days: days }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invites"] });
      pushToast({ message: "Invitación creada", type: "success" });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) =>
      clientFetch(`/households/current/invites/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invites"] });
      pushToast({ message: "Invitación revocada", type: "info" });
    },
  });

  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Invitaciones
      </h2>

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3.5">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-muted">Rol que otorga</span>
          <div className="grid grid-cols-3 gap-1.5">
            {(["adult", "teen", "guest"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                className={`min-h-[44px] rounded-lg border px-1 text-sm font-medium ${
                  role === value
                    ? "border-brand bg-brand-contrast font-bold text-brand"
                    : "border-border bg-surface text-text"
                }`}
              >
                {ROLE_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-muted">Vigencia</span>
          <div className="flex gap-1.5">
            {DURATIONS.map((duration) => (
              <button
                key={duration.days}
                type="button"
                onClick={() => setDays(duration.days)}
                className={`min-h-[44px] flex-1 rounded-lg border px-1 text-sm font-medium ${
                  days === duration.days
                    ? "border-brand bg-brand-contrast font-bold text-brand"
                    : "border-border bg-surface text-text"
                }`}
              >
                {duration.label}
              </button>
            ))}
          </div>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? "Generando…" : "Crear invitación"}
        </Button>
        {create.isSuccess ? (
          <div className="flex gap-2">
            <div className="flex-1 rounded-xl border border-brand bg-surface-sunken p-3 text-center">
              <p data-testid="invite-code" className="tabular text-2xl font-bold tracking-[0.14em]">
                {(create.data as Invite).code}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                onClick={() => handleShare((create.data as Invite).code, window.location.origin)}
                className="whitespace-nowrap"
              >
                Compartir
              </Button>
              <Button
                variant="secondary"
                onClick={() => copyToClipboard((create.data as Invite).code)}
                className="whitespace-nowrap"
              >
                Copiar código
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {invites.data?.length ? (
        <Card className="flex flex-col divide-y divide-border p-0">
          {invites.data.map((invite) => (
            <div
              key={invite.id}
              className={`flex items-center gap-3 p-3.5 ${invite.revoked_at ? "bg-surface-sunken" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p
                  className={`tabular font-bold tracking-[0.14em] ${
                    invite.revoked_at ? "text-text-muted line-through" : ""
                  }`}
                >
                  {invite.code}
                </p>
                <p className="text-xs text-text-muted">{expiryLabel(invite)}</p>
              </div>
              {invite.revoked_at ? null : (
                <Button
                  variant="secondary"
                  onClick={() => revoke.mutate(invite.id)}
                  disabled={revoke.isPending}
                  className="!text-expense"
                >
                  Revocar
                </Button>
              )}
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
