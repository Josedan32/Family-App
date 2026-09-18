import { evaluatePasswordStrength, type PasswordLevel } from "@/lib/passwordStrength";

const BAR_CLASSES: Record<PasswordLevel, string> = {
  empty: "bg-surface-sunken",
  insegura: "bg-danger",
  media: "bg-warning",
  segura: "bg-success",
};

const TEXT_CLASSES: Record<PasswordLevel, string> = {
  empty: "text-text-muted",
  insegura: "text-danger",
  media: "text-warning",
  segura: "text-success",
};

/** Updates on every keystroke — never only on submit — so the color and
 * copy always reflect what's currently typed. */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = evaluatePasswordStrength(password);
  if (strength.level === "empty") return null;

  const filled = strength.level === "insegura" ? 1 : strength.level === "media" ? 2 : 3;

  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <div className="flex gap-1" role="presentation">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < filled ? BAR_CLASSES[strength.level] : "bg-surface-sunken"}`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${TEXT_CLASSES[strength.level]}`}>
        {strength.missingRequired ?? `Contraseña ${strength.label.toLowerCase()}`}
        {strength.suggestions.length > 0
          ? ` · agrega ${strength.suggestions.join(", ")} para hacerla más segura`
          : ""}
      </p>
    </div>
  );
}
