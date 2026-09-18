import { describe, expect, it } from "vitest";

import {
  evaluatePasswordStrength,
  passwordConfirmationError,
} from "../passwordStrength";

describe("evaluatePasswordStrength", () => {
  it("is empty for an empty password", () => {
    expect(evaluatePasswordStrength("").level).toBe("empty");
  });

  it("is insegura below the 12-character minimum, and says how many are missing", () => {
    const result = evaluatePasswordStrength("short1");
    expect(result.level).toBe("insegura");
    expect(result.missingRequired).toMatch(/6 caracteres/);
  });

  it("is media at 12+ characters with limited variety", () => {
    const result = evaluatePasswordStrength("lowercaseonly");
    expect(result.level).toBe("media");
    expect(result.suggestions).toContain("una mayúscula");
    expect(result.suggestions).toContain("un número");
  });

  it("is segura with three character classes at 12+ length", () => {
    const result = evaluatePasswordStrength("Abcdefgh123");
    // 11 chars — bump to 12 to satisfy the mandatory rule too
    const twelvePlus = evaluatePasswordStrength("Abcdefgh1234");
    expect(twelvePlus.level).toBe("segura");
    expect(result.level).not.toBe("segura"); // still short of 12
  });

  it("is segura at 16+ characters even with only one class", () => {
    const result = evaluatePasswordStrength("aaaaaaaaaaaaaaaa");
    expect(result.level).toBe("segura");
  });

  it("has no missingRequired once the minimum length is met", () => {
    expect(evaluatePasswordStrength("Abcdefgh1234").missingRequired).toBeNull();
  });
});

describe("passwordConfirmationError", () => {
  it("is null while the confirmation field is empty", () => {
    expect(passwordConfirmationError("secret", "")).toBeNull();
  });

  it("flags a mismatch as soon as the confirmation differs", () => {
    expect(passwordConfirmationError("secret", "secre")).toBe(
      "Las contraseñas no coinciden",
    );
  });

  it("is null once they match", () => {
    expect(passwordConfirmationError("secret", "secret")).toBeNull();
  });
});
