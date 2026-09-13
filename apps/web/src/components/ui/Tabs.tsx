"use client";

interface Tab {
  id: string;
  label: string;
}

interface Props {
  tabs: readonly Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div
      role="tablist"
      className="flex gap-1 rounded-2xl border border-border bg-surface-sunken p-1"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`min-h-[44px] flex-1 rounded-[10px] text-[0.9375rem] font-medium ${
              selected ? "bg-surface text-brand shadow-sm" : "text-text-muted"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
