"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { clientFetch } from "@/lib/api/client";
import { pushToast } from "@/lib/toast";

import { VisibilityBadge, type Level } from "./VisibilityBadge";

export interface VisibilitySettings {
  income: Level;
  expenses: Level;
  savings: Level;
  debts: Level;
  disclosures: string[];
}

const MODULES: { key: keyof Omit<VisibilitySettings, "disclosures">; label: string }[] = [
  { key: "income", label: "Ingresos" },
  { key: "expenses", label: "Gastos" },
  { key: "savings", label: "Ahorros" },
  { key: "debts", label: "Deudas" },
];

const OPTIONS: { value: Level; label: string; hint: string }[] = [
  { value: "private", label: "Privado", hint: "Nadie más ve nada." },
  { value: "summary", label: "Resumen", hint: "Los demás ven solo el total." },
  { value: "public", label: "Público", hint: "Los demás ven cada movimiento." },
];

export function VisibilitySettingsForm({ initial }: { initial: VisibilitySettings }) {
  const [levels, setLevels] = useState(initial);

  const save = useMutation({
    mutationFn: (next: VisibilitySettings) =>
      clientFetch("/me/visibility", {
        method: "PUT",
        body: JSON.stringify({
          income: next.income,
          expenses: next.expenses,
          savings: next.savings,
          debts: next.debts,
        }),
      }),
    onSuccess: () => pushToast({ message: "Configuración guardada", type: "success" }),
  });

  return (
    <div className="flex flex-col gap-4">
      {MODULES.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface p-3.5">
          <div className="flex items-center justify-between">
            <label htmlFor={key} className="font-medium">
              {label}
            </label>
            <VisibilityBadge level={levels[key]} />
          </div>
          <select
            id={key}
            aria-label={label}
            value={levels[key]}
            onChange={(event) => setLevels({ ...levels, [key]: event.target.value as Level })}
            className="min-h-[44px] rounded-lg border border-border bg-surface px-3 py-2"
          >
            {OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.hint}
              </option>
            ))}
          </select>
        </div>
      ))}

      <Button onClick={() => save.mutate(levels)} disabled={save.isPending}>
        {save.isPending ? "Guardando…" : "Guardar"}
      </Button>

      {/* Verbatim from the API so this copy cannot drift from the rules
          it describes (FR-M3-08). */}
      <section className="flex flex-col gap-2 rounded-2xl bg-surface-sunken p-3.5">
        {initial.disclosures.map((text) => (
          <p key={text} className="text-sm text-text-muted">
            {text}
          </p>
        ))}
      </section>
    </div>
  );
}
