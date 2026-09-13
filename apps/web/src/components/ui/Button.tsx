import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-contrast active:opacity-80",
  secondary: "bg-surface border border-border text-text active:bg-surface-sunken",
  ghost: "text-brand active:bg-surface-sunken",
  danger: "bg-danger text-white active:opacity-80",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`rounded-lg px-4 py-3 font-medium transition-opacity disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}
