"use client";

import { useRef } from "react";

import { IconChevronLeft, IconChevronRight } from "@/components/ui/Icons";
import { currentMonth, monthLabel, shiftMonth } from "@/lib/months";

/**
 * ‹ Septiembre 2026 › — step a month at a time, or tap the name for the
 * native month picker (iOS's own wheel beats anything custom). The future is
 * off limits: there is nothing recorded there yet.
 */
export function MonthStepper({
  value,
  onChange,
}: {
  value: string;
  onChange: (month: string) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const latest = currentMonth();
  const isLatest = value >= latest;

  return (
    <div className="flex items-center gap-1 rounded-2xl border border-border bg-surface p-1 shadow-sm">
      <button
        type="button"
        aria-label="Mes anterior"
        onClick={() => onChange(shiftMonth(value, -1))}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-xl text-text-muted active:bg-surface-sunken"
      >
        <IconChevronLeft />
      </button>

      <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center">
        <button
          type="button"
          onClick={() => {
            try {
              picker.current?.showPicker();
            } catch {
              picker.current?.focus();
            }
          }}
          className="min-h-11 truncate px-2 text-[0.9375rem] font-semibold"
        >
          {monthLabel(value)}
        </button>
        <input
          ref={picker}
          type="month"
          aria-label="Elegir mes"
          value={value}
          max={latest}
          onChange={(event) => event.target.value && onChange(event.target.value)}
          className="pointer-events-none absolute inset-0 opacity-0"
          tabIndex={-1}
        />
      </div>

      {isLatest ? null : (
        <button
          type="button"
          onClick={() => onChange(latest)}
          className="min-h-9 flex-none rounded-full bg-brand-tint px-3 text-xs font-semibold text-brand"
        >
          Este mes
        </button>
      )}
      <button
        type="button"
        aria-label="Mes siguiente"
        disabled={isLatest}
        onClick={() => onChange(shiftMonth(value, 1))}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-xl text-text-muted active:bg-surface-sunken disabled:opacity-30"
      >
        <IconChevronRight />
      </button>
    </div>
  );
}
