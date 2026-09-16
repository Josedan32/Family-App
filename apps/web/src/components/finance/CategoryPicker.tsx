interface Category {
  id: string;
  name: string;
  kind: string;
}

/**
 * Single-select for now. A multi-select mode lands with real
 * multi-category support on transactions (docs/superpowers/plans —
 * Fase 3.1); household expenses keep one category by design either way.
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[] | undefined;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Categoría
      </span>
      <div role="radiogroup" aria-label="Categoría" className="grid grid-cols-3 gap-2">
        {categories?.map((category) => {
          const selected = category.id === value;
          return (
            <button
              key={category.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(category.id)}
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
