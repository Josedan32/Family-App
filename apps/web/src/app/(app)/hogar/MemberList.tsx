"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

export interface Member {
  id: string;
  display_name: string;
  photo_url: string | null;
  relationship: string | null;
  role: string;
  status: string;
  age: number | null;
}

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  adult: "Adulto",
  teen: "Adolescente",
  guest: "Invitado",
};

const ROLE_OPTIONS = ["admin", "adult", "teen", "guest"] as const;

function MemberEditModal({
  member,
  onClose,
}: {
  member: Member;
  onClose: () => void;
}) {
  const router = useRouter();
  const [role, setRole] = useState(member.role);
  const [relationship, setRelationship] = useState(member.relationship ?? "");

  // Edits logistics only (role, relationship) — never any financial field of
  // the member being edited (docs/testing-strategy.md: admin has no
  // visibility into another member's finances).
  const update = useMutation({
    mutationFn: () =>
      clientFetch(`/households/current/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role, relationship: relationship || null }),
      }),
    onSuccess: () => {
      pushToast({ message: "Miembro actualizado", type: "success" });
      router.refresh();
      onClose();
    },
  });

  return (
    <Sheet open onClose={onClose} title={member.display_name}>
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate();
        }}
      >
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Rol
          </span>
          <div role="radiogroup" aria-label="Rol" className="grid grid-cols-2 gap-2">
            {ROLE_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={role === value}
                onClick={() => setRole(value)}
                className={`min-h-[48px] rounded-xl border px-1 text-sm font-medium ${
                  role === value
                    ? "border-brand bg-brand font-bold text-brand-contrast"
                    : "border-border bg-surface text-text active:bg-surface-sunken"
                }`}
              >
                {ROLE_LABEL[value]}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Parentesco"
          value={relationship}
          onChange={(event) => setRelationship(event.target.value)}
        />

        {update.isError ? (
          <p role="alert" className="text-sm text-danger">
            {(update.error as Error).message}
          </p>
        ) : null}

        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </form>
    </Sheet>
  );
}

export function MemberList({
  members,
  isAdmin,
  myMemberId,
}: {
  members: Member[];
  isAdmin: boolean;
  myMemberId: string;
}) {
  const [editing, setEditing] = useState<Member | null>(null);

  return (
    <>
      <Card className="flex flex-col divide-y divide-border p-0">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-3 p-3.5">
            <Link
              href={`/hogar/miembros/${member.id}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <Avatar displayName={member.display_name} photoUrl={member.photo_url} seed={member.id} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{member.display_name}</p>
                <p className="text-xs text-text-muted">
                  {member.relationship}
                  {member.age !== null ? ` · ${member.age} años` : ""}
                </p>
              </div>
            </Link>
            {member.id === myMemberId && member.age === null ? (
              <Link href="/ajustes/perfil" className="text-xs font-semibold text-brand">
                Agrega tu fecha de nacimiento
              </Link>
            ) : null}
            <span className="flex-none rounded-lg border border-brand bg-surface-sunken px-2 py-1 text-xs font-semibold text-brand">
              {ROLE_LABEL[member.role] ?? member.role}
            </span>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setEditing(member)}
                aria-label={`Editar a ${member.display_name}`}
                className="flex-none text-xs font-semibold text-brand"
              >
                Editar
              </button>
            ) : null}
          </div>
        ))}
      </Card>

      {editing ? <MemberEditModal member={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
