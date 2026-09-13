"use client";

import { useId, type InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
}

export function Input({ label, helperText, className = "", ...rest }: Props) {
  const id = useId();
  const helperId = helperText ? `${id}-helper` : undefined;
  return (
    <div className="flex flex-col gap-1">
      {/* A real label. Placeholders are never labels. */}
      <label htmlFor={id} className="text-sm font-medium text-text-muted">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={helperId}
        {...rest}
        className={`min-h-[52px] rounded-xl border border-border bg-surface px-3.5 text-base ${className}`}
      />
      {helperText ? (
        <span id={helperId} className="text-xs text-text-muted">
          {helperText}
        </span>
      ) : null}
    </div>
  );
}
