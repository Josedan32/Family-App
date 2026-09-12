"use client";

import { useId } from "react";

import { groupDigits, parseAmountInput } from "@/lib/money";

interface Props {
  label: string;
  value: number;
  onChange: (amountMinor: number) => void;
  currency: string;
  required?: boolean;
}

export function MoneyInput({ label, value, onChange, currency, required }: Props) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-text-muted">
        {label}
      </label>
      <input
        id={id}
        /* Not type="number": its mobile keyboard and validation are both wrong
           for currency, and it allows exponent notation. */
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        value={value === 0 ? "" : groupDigits(value, currency)}
        onChange={(event) => onChange(parseAmountInput(event.target.value))}
        className="tabular rounded-lg border border-border bg-surface px-3 py-3 text-xl"
      />
    </div>
  );
}
