interface Category {
  id: string;
  name: string;
  kind: string;
  is_contribution_category: boolean;
}

type Props =
  | {
      categories: Category[] | undefined;
      mode?: "single";
      value: string;
      onChange: (id: string) => void;
    }
  | {
      categories: Category[] | undefined;
      mode: "multi";
      value: string[];
      onChange: (ids: string[]) => void;
    };

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
  const selectable = categories?.filter((category) => !category.is_contribution_category);
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

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Categoría{multi ? " (elige una o más)" : ""}
      </span>
      <div
        role={multi ? "group" : "radiogroup"}
        aria-label="Categoría"
        className="grid grid-cols-3 gap-2"
      >
        {selectable?.map((category) => {
          const selected = isSelected(category.id);
          return (
            <button
              key={category.id}
              type="button"
              role={multi ? undefined : "radio"}
              aria-checked={multi ? undefined : selected}
              aria-pressed={multi ? selected : undefined}
              onClick={() => toggle(category.id)}
              className={`min-h-[48px] rounded-xl border px-1 text-sm font-medium ${
                selected
                  ? "border-brand bg-brand font-bold text-brand-contrast"
                  : "border-border bg-surface text-text active:bg-surface-sunken"
              }`}
            >
              {category.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
