import { useId, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-contrast active:opacity-80",
  secondary: "bg-surface border border-border text-text active:bg-surface-sunken",
  ghost: "text-brand active:bg-surface-sunken",
  danger: "bg-danger text-white active:opacity-80",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /**
   * Why the button is disabled, rendered as always-visible inline text —
   * never a hover tooltip, per the project's no-hover ruling.
   * Only shown while `disabled` is true.
   */
  disabledReason?: string;
}

export function Button({
  variant = "primary",
  className = "",
  disabledReason,
  disabled,
  ...rest
}: Props) {
  const id = useId();
  const reasonId = disabled && disabledReason ? `${id}-disabled-reason` : undefined;
  const button = (
    <button
      disabled={disabled}
      aria-describedby={reasonId}
      {...rest}
      className={`rounded-lg px-4 py-3 font-medium transition-opacity disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
  if (!reasonId) {
    return button;
  }
  return (
    <div className="flex flex-col gap-1">
      {button}
      <span id={reasonId} className="text-xs text-warning">
        {disabledReason}
      </span>
    </div>
  );
}
