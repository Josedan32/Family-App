/** Mirrors `password: str = Field(min_length=12, ...)` in
 * apps/api/src/family_api/schemas/auth.py — the one rule the server
 * actually enforces. Everything past it is advisory. */
export const MIN_PASSWORD_LENGTH = 12;

export type PasswordLevel = "empty" | "insegura" | "media" | "segura";

export interface PasswordStrength {
  level: PasswordLevel;
  label: string;
  /** Set only while the mandatory length rule isn't met yet. */
  missingRequired: string | null;
  /** Optional ways to go from "media" to "segura". */
  suggestions: string[];
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (password.length === 0) {
    return { level: "empty", label: "", missingRequired: null, suggestions: [] };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    const remaining = MIN_PASSWORD_LENGTH - password.length;
    return {
      level: "insegura",
      label: "Insegura",
      missingRequired: `Le faltan ${remaining} caracter${remaining === 1 ? "" : "es"} (mínimo ${MIN_PASSWORD_LENGTH})`,
      suggestions: [],
    };
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const variety = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  const suggestions: string[] = [];
  if (!hasUpper) suggestions.push("una mayúscula");
  if (!hasDigit) suggestions.push("un número");
  if (!hasSymbol) suggestions.push("un símbolo");

  if (variety >= 3 || password.length >= 16) {
    return { level: "segura", label: "Segura", missingRequired: null, suggestions: [] };
  }

  return { level: "media", label: "Media", missingRequired: null, suggestions };
}

export function passwordConfirmationError(password: string, confirmation: string): string | null {
  if (confirmation.length === 0) return null;
  return confirmation === password ? null : "Las contraseñas no coinciden";
}
