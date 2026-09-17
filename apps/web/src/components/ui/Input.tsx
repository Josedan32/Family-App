"use client";

import { useId, type InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  /** Feedback before submit, not only after a failed request. */
  error?: string;
  warning?: string;
}

export function Input({ label, helperText, error, warning, className = "", ...rest }: Props) {
  const id = useId();
  const helperId = helperText ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const warningId = warning ? `${id}-warning` : undefined;
  return (
    <div className="flex flex-col gap-1">
      {/* A real label. Placeholders are never labels. */}
      <label htmlFor={id} className="text-sm font-medium text-text-muted">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={errorId ?? warningId ?? helperId}
        aria-invalid={error ? true : undefined}
        {...rest}
        className={`min-h-[52px] rounded-xl border bg-surface px-3.5 text-base ${
          error ? "border-danger" : warning ? "border-warning" : "border-border"
        } ${className}`}
      />
      {error ? (
        <span id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : warning ? (
        <span id={warningId} role="alert" className="text-xs text-warning">
          {warning}
        </span>
      ) : helperText ? (
        <span id={helperId} className="text-xs text-text-muted">
          {helperText}
        </span>
      ) : null}
    </div>
  );
}
