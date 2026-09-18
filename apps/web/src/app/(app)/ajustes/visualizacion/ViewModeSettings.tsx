"use client";

import { setViewMode, useViewMode, type ViewMode } from "@/lib/viewMode";

const OPTIONS: { value: ViewMode; label: string; description: string }[] = [
  {
    value: "cards",
    label: "Tarjetas",
    description: "Cada movimiento en su tarjeta. Cómodo en el celular.",
  },
  {
    value: "table",
    label: "Tablas",
    description: "Más movimientos a la vista, en filas y columnas. Toca una fila para ver el detalle.",
  },
];

export function ViewModeSettings() {
  const mode = useViewMode();

  return (
    <div role="radiogroup" aria-label="Cómo ver las listas" className="flex flex-col gap-2">
      {OPTIONS.map((option) => {
        const selected = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setViewMode(option.value)}
            className={`flex flex-col gap-0.5 rounded-xl border p-3.5 text-left ${
              selected ? "border-brand bg-brand-tint" : "border-border bg-surface"
            }`}
          >
            <span className={`font-semibold ${selected ? "text-brand" : ""}`}>{option.label}</span>
            <span className="text-sm text-text-muted">{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}
