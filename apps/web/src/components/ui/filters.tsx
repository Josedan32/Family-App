"use client";

import { IconClose, IconSearch, IconSliders } from "@/components/ui/Icons";

/** The pieces every filterable list is built from, so they all look alike. */

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      <span aria-hidden="true" className="pointer-events-none absolute left-3 text-text-muted">
        <IconSearch />
      </span>
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-9 text-sm placeholder:text-text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => onChange("")}
          className="absolute right-1.5 flex h-8 w-8 items-center justify-center rounded-full text-text-muted active:bg-surface-sunken"
        >
          <IconClose />
        </button>
      ) : null}
    </div>
  );
}

export function FilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count ? `Filtros, ${count} activos` : "Filtros"}
      className={`relative flex min-h-11 flex-none items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold ${
        count ? "border-brand bg-brand-tint text-brand" : "border-border bg-surface text-text"
      }`}
    >
      <IconSliders />
      <span className="hidden sm:inline">Filtros</span>
      {count ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[0.6875rem] font-bold text-brand-contrast">
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function FilterChip({
  selected,
  onClick,
  children,
  count,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors ${
        selected
          ? "border-brand bg-brand font-semibold text-brand-contrast"
          : "border-border bg-surface text-text active:bg-surface-sunken"
      }`}
    >
      {children}
      {count !== undefined ? (
        <span
          className={`tabular text-xs ${selected ? "text-brand-contrast/80" : "text-text-muted"}`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** A single choice shown as chips, scrolling sideways instead of wrapping. */
export function ChipChoice<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: Value; label: string; count?: number }[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex min-h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium ${
            value === option.value
              ? "border-brand bg-brand font-semibold text-brand-contrast"
              : "border-border bg-surface text-text active:bg-surface-sunken"
          }`}
        >
          {option.label}
          {option.count !== undefined ? (
            <span
              className={`tabular text-xs ${
                value === option.value ? "text-brand-contrast/80" : "text-text-muted"
              }`}
            >
              {option.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Active filters as removable chips, so nothing hides behind the sheet. */
export function ActiveFilters({
  items,
  onClear,
}: {
  items: { key: string; label: string; onRemove: () => void }[];
  onClear: () => void;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.onRemove}
          aria-label={`Quitar filtro ${item.label}`}
          className="flex min-h-8 items-center gap-1 rounded-full bg-brand-tint pl-3 pr-1.5 text-xs font-semibold text-brand"
        >
          {item.label}
          <IconClose />
        </button>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="min-h-8 px-2 text-xs font-semibold text-text-muted underline-offset-2 active:underline"
      >
        Limpiar
      </button>
    </div>
  );
}

export function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}
