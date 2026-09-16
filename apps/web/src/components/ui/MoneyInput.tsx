"use client";

import { useId } from "react";

import { groupDigits, parseAmountInput } from "@/lib/money";

type Kind = "income" | "expense" | "savings" | "debt";

interface Props {
  label: string;
  value: number;
  onChange: (amountMinor: number) => void;
  currency: string;
  required?: boolean;
  /**
   * Colors the field. Income/expense also prefix +/− — savings and debt
   * amounts are never signed, they just carry their module's color.
   */
  kind?: Kind;
  /** Feedback before submit, not only after a failed request. */
  error?: string;
  onBlur?: () => void;
}

const SIGN: Partial<Record<Kind, string>> = { income: "+", expense: "−" };
const TONE: Record<Kind, string> = {
  income: "text-income",
  expense: "text-expense",
  savings: "text-savings",
  debt: "text-debt",
};

export function MoneyInput({
  label,
  value,
  onChange,
  currency,
  required,
  kind,
  error,
  onBlur,
}: Props) {
  const id = useId();
  const tone = kind ? TONE[kind] : "";
  const sign = kind ? (SIGN[kind] ?? "") : "";
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-text-muted">
        {label}
      </label>
      <div className={`relative flex items-center ${tone}`}>
        <span aria-hidden="true" className="pointer-events-none absolute left-3 text-xl">
          {sign}${" "}
        </span>
        <input
          id={id}
          /* Not type="number": its mobile keyboard and validation are both wrong
             for currency, and it allows exponent notation. */
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required={required}
          aria-describedby={errorId}
          aria-invalid={error ? true : undefined}
          value={value === 0 ? "" : groupDigits(value, currency)}
          onChange={(event) => onChange(parseAmountInput(event.target.value))}
          onBlur={onBlur}
          className={`tabular w-full rounded-lg border bg-surface py-3 pr-3 text-xl ${
            error ? "border-danger" : "border-border"
          } ${kind ? "pl-9" : "pl-7"}`}
        />
      </div>
      {error ? (
        <span id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
