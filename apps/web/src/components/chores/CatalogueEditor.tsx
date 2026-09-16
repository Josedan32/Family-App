"use client";

import { IconArrowDown, IconArrowUp, IconClose, IconPlus } from "@/components/ui/Icons";

/**
 * Edits one ordered list of short lines — the steps of a chore, or the supplies
 * it needs (FR-M8-16).
 *
 * Reordering matters for steps: they are instructions, not a set. The same
 * control serves requirements, where order is merely the order someone typed
 * them in, because a second component for so little would earn nothing.
 */
export function CatalogueEditor({
  label,
  hint,
  items,
  onChange,
  addLabel,
  max = 20,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  addLabel: string;
  max?: number;
}) {
  function replace(index: number, value: string) {
    onChange(items.map((item, i) => (i === index ? value : item)));
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </span>

      {items.length === 0 ? (
        <p className="text-sm text-text-muted">Todavía no hay nada.</p>
      ) : (
        <ul className="flex flex-col gap-2 rounded-xl border border-border p-2">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <input
                value={item}
                maxLength={120}
                aria-label={`${label} ${index + 1}`}
                onChange={(event) => replace(index, event.target.value)}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-base"
              />
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Subir ${label} ${index + 1}`}
                className="flex h-11 w-9 flex-none items-center justify-center rounded-xl text-text-muted disabled:opacity-30"
              >
                <IconArrowUp />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
                aria-label={`Bajar ${label} ${index + 1}`}
                className="flex h-11 w-9 flex-none items-center justify-center rounded-xl text-text-muted disabled:opacity-30"
              >
                <IconArrowDown />
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Quitar ${label} ${index + 1}`}
                className="flex h-11 w-9 flex-none items-center justify-center rounded-xl text-danger"
              >
                <IconClose />
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length < max ? (
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-brand"
        >
          <IconPlus />
          {addLabel}
        </button>
      ) : (
        <p className="text-xs font-medium text-warning">
          Máximo {max}. Si necesitas más, probablemente son dos tareas.
        </p>
      )}

      {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}
