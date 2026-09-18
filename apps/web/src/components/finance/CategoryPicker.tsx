"use client";

import { useState } from "react";

interface Category {
  id: string;
  name: string;
  kind: string;
  is_contribution_category: boolean;
  /** Written only by the API on mirrored rows ("Aporte al hogar", "Retiro de
   *  ahorro"…). Absent on older fixtures; absent means pickable. */
  is_reserved?: boolean;
}

type Props =
  | {
      categories: Category[] | undefined;
      mode?: "single";
      value: string;
      onChange: (id: string) => void;
      label?: string;
    }
  | {
      categories: Category[] | undefined;
      mode: "multi";
      value: string[];
      onChange: (ids: string[]) => void;
      label?: string;
    };

/** Beyond this many chips, the picker collapses — the list keeps growing
 * (docs/prueba-end-to-end.md §5 alone adds four) and a wall of buttons
 * before the rest of the form is worse than one extra tap. */
const COLLAPSED_COUNT = 8;

/**
 * Single-select by default; pass `mode="multi"` for real multi-category
 * selection (personal transactions only — household expenses keep one
 * category by design).
 *
 * "Aporte al hogar" is written only by record_contribution itself — it is
 * NOT the same thing as `is_system` (every seeded default carries that, and
 * all of those are perfectly normal, pickable categories; `is_system` only
 * means "archived, never deleted"). Letting someone pick the contribution
 * category by hand here creates a look-alike transaction that never becomes
 * a real contribution, never shows the "Aporte" pill and never appears in
 * Gastos del Hogar, which is confusing enough to be a bug.
 */
export function CategoryPicker(props: Props) {
  const { categories } = props;
  const [expanded, setExpanded] = useState(false);
  const selectable =
    categories?.filter(
      (category) => !category.is_contribution_category && !category.is_reserved,
    ) ?? [];
  const multi = props.mode === "multi";

  function isSelected(id: string): boolean {
    return multi ? props.value.includes(id) : props.value === id;
  }

  function toggle(id: string) {
    if (multi) {
      const next = props.value.includes(id)
        ? props.value.filter((v) => v !== id)
        : [...props.value, id];
      props.onChange(next);
    } else {
      props.onChange(id);
    }
  }

  // Never hides an already-selected chip behind "Ver más" — editing a
  // transaction whose category sits past the fold must still show it picked.
  const visible =
    expanded || selectable.length <= COLLAPSED_COUNT
      ? selectable
      : selectable.filter((category, index) => index < COLLAPSED_COUNT || isSelected(category.id));
  const hiddenCount = selectable.length - visible.length;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {props.label ?? `Categoría${multi ? " (elige una o más)" : ""}`}
      </span>
      <div role={multi ? "group" : "radiogroup"} aria-label="Categoría" className="flex flex-wrap gap-1.5">
        {visible.map((category) => {
          const selected = isSelected(category.id);
          return (
            <button
              key={category.id}
              type="button"
              role={multi ? undefined : "radio"}
              aria-checked={multi ? undefined : selected}
              aria-pressed={multi ? selected : undefined}
              onClick={() => toggle(category.id)}
              className={`min-h-9 rounded-full border px-3 text-sm font-medium ${
                selected
                  ? "border-brand bg-brand font-bold text-brand-contrast"
                  : "border-border bg-surface text-text active:bg-surface-sunken"
              }`}
            >
              {category.name}
            </button>
          );
        })}
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="min-h-9 rounded-full border border-dashed border-border px-3 text-sm font-medium text-brand"
          >
            +{hiddenCount} más
          </button>
        ) : null}
        {expanded && selectable.length > COLLAPSED_COUNT ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="min-h-9 rounded-full border border-dashed border-border px-3 text-sm font-medium text-text-muted"
          >
            Ver menos
          </button>
        ) : null}
      </div>
    </div>
  );
}
