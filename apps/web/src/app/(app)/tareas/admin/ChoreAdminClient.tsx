"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CatalogueEditor } from "@/components/chores/CatalogueEditor";
import { EffortSlider } from "@/components/chores/EffortSlider";
import { Button } from "@/components/ui/Button";
import { IconLock, IconPlus } from "@/components/ui/Icons";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { clientFetch } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { pushToast } from "@/lib/toast";

export interface Chore {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  effort_points: number;
  activities: string[];
  requirements: string[];
  expectation: string | null;
  archived_at: string | null;
}

const FREQUENCIES = ["daily", "weekly", "biweekly", "monthly"] as const;
type Frequency = (typeof FREQUENCIES)[number];

const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: "Diaria",
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
};

interface FormState {
  name: string;
  description: string;
  frequency: Frequency;
  effort_points: number;
  activities: string[];
  requirements: string[];
  expectation: string;
}

const BLANK_FORM: FormState = {
  name: "",
  description: "",
  frequency: "weekly",
  effort_points: 5,
  activities: [],
  requirements: [],
  expectation: "",
};

function formFor(target: Chore | "new"): FormState {
  if (target === "new") return BLANK_FORM;
  return {
    name: target.name,
    description: target.description ?? "",
    frequency: target.frequency as Frequency,
    effort_points: target.effort_points,
    activities: target.activities,
    requirements: target.requirements,
    expectation: target.expectation ?? "",
  };
}

function ChoreForm({
  initial,
  choreId,
  onDone,
}: {
  initial: FormState;
  choreId: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      choreId
        ? clientFetch<Chore>(`/chores/${choreId}`, {
            method: "PATCH",
            body: JSON.stringify(form),
          })
        : clientFetch<Chore>("/chores", { method: "POST", body: JSON.stringify(form) }),
    onError: (error) => {
      // Branch on the slug, never the title (docs/api-contract.md).
      if (error instanceof ApiError && error.type === "duplicate_chore") {
        setFormError("Ya existe una tarea con ese nombre.");
      } else {
        setFormError((error as Error).message);
      }
    },
    onSuccess: async () => {
      router.refresh();
      pushToast({ message: choreId ? "Tarea actualizada" : "Tarea creada", type: "success" });
      onDone();
    },
  });

  const remove = useMutation({
    mutationFn: () => clientFetch(`/chores/${choreId}`, { method: "DELETE" }),
    onSuccess: async () => {
      router.refresh();
      pushToast({ message: "Tarea eliminada", type: "info" });
      onDone();
    },
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setFormError(null);
        save.mutate();
      }}
    >
      <Input
        label="Nombre"
        required
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-text-muted">Descripción (opcional)</span>
        <textarea
          rows={2}
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Frecuencia
        </span>
        <div role="radiogroup" aria-label="Frecuencia" className="grid grid-cols-2 gap-2">
          {FREQUENCIES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={form.frequency === value}
              onClick={() => setForm({ ...form, frequency: value })}
              className={`min-h-[48px] rounded-xl border px-1 text-sm font-medium ${
                form.frequency === value
                  ? "border-brand bg-brand-contrast font-bold text-brand"
                  : "border-border bg-surface text-text"
              }`}
            >
              {FREQUENCY_LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      <EffortSlider
        value={form.effort_points}
        onChange={(effort_points) => setForm({ ...form, effort_points })}
      />

      <CatalogueEditor
        label="Pasos"
        addLabel="Añadir paso"
        items={form.activities}
        onChange={(activities) => setForm({ ...form, activities })}
      />

      <CatalogueEditor
        label="Necesitas"
        addLabel="Añadir insumo"
        items={form.requirements}
        onChange={(requirements) => setForm({ ...form, requirements })}
      />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-text-muted">
          Se considera hecha cuando (opcional)
        </span>
        <textarea
          rows={2}
          maxLength={500}
          value={form.expectation}
          onChange={(event) => setForm({ ...form, expectation: event.target.value })}
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base"
        />
      </label>

      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={save.isPending || !form.name.trim()}>
        {save.isPending ? "Guardando…" : "Guardar"}
      </Button>

      {choreId ? (
        <Button
          type="button"
          variant="secondary"
          className="!text-danger"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          {remove.isPending ? "Eliminando…" : "Eliminar tarea"}
        </Button>
      ) : null}
    </form>
  );
}

export function ChoreAdminClient({ chores, isAdmin }: { chores: Chore[]; isAdmin: boolean }) {
  const [editing, setEditing] = useState<Chore | "new" | null>(null);

  return (
    <>
      <ul className="flex flex-col gap-2">
        {!isAdmin ? (
          <li className="flex items-start gap-2.5 rounded-2xl border border-border bg-surface-sunken p-3.5">
            <span aria-hidden="true" className="mt-0.5 flex-none text-text-muted">
              <IconLock />
            </span>
            <span className="text-sm text-text-muted">
              Los puntos de esfuerzo los define el administrador del hogar. Puedes consultarlos,
              no cambiarlos.
            </span>
          </li>
        ) : null}

        {chores.map((chore) => {
          const row = (
            <div className="flex items-center gap-3.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-semibold">{chore.name}</span>
                <span className="text-xs text-text-muted">
                  {FREQUENCY_LABEL[chore.frequency as Frequency] ?? chore.frequency}
                </span>
              </div>
              <div className="flex flex-none flex-col items-center gap-px">
                <span className="tabular text-xl font-bold text-brand">
                  {chore.effort_points}
                </span>
                <span className="text-[0.625rem] uppercase tracking-wide text-text-muted">
                  {chore.effort_points === 1 ? "pt" : "pts"}
                </span>
              </div>
              {isAdmin ? (
                <span aria-hidden="true" className="flex-none text-text-muted">
                  ›
                </span>
              ) : null}
            </div>
          );

          return isAdmin ? (
            <li key={chore.id}>
              <button
                type="button"
                onClick={() => setEditing(chore)}
                className="min-h-[64px] w-full rounded-2xl border border-border bg-surface p-3.5 text-left active:bg-surface-sunken"
              >
                {row}
              </button>
            </li>
          ) : (
            <li
              key={chore.id}
              className="min-h-[64px] rounded-2xl border border-border bg-surface p-3.5"
            >
              {row}
            </li>
          );
        })}
      </ul>

      {isAdmin ? (
        <>
          <button
            aria-label="Nueva tarea"
            onClick={() => setEditing("new")}
            className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl text-brand-contrast shadow-lg active:bg-brand-pressed md:bottom-6"
          >
            <IconPlus />
          </button>

          <Sheet
            open={editing !== null}
            onClose={() => setEditing(null)}
            title={editing === "new" ? "Nueva tarea" : (editing?.name ?? "")}
          >
            {editing !== null ? (
              <ChoreForm
                key={editing === "new" ? "new" : editing.id}
                initial={formFor(editing)}
                choreId={editing === "new" ? null : editing.id}
                onDone={() => setEditing(null)}
              />
            ) : null}
          </Sheet>
        </>
      ) : null}
    </>
  );
}
