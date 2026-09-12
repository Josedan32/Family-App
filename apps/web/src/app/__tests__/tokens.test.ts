import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

describe("design tokens", () => {
  it("defines every semantic color token", () => {
    for (const token of [
      "--bg", "--surface", "--surface-sunken", "--border", "--text", "--text-muted",
      "--brand", "--brand-contrast", "--income", "--expense", "--savings", "--debt",
      "--private", "--danger", "--warning", "--success",
    ]) {
      expect(css).toContain(token);
    }
  });

  it("redefines tokens for dark mode", () => {
    expect(css).toContain("prefers-color-scheme: dark");
  });

  it("never uses 100vh", () => {
    // iOS Safari: 100vh excludes the toolbar, so full-height screens get clipped.
    expect(css).not.toMatch(/\b100vh\b/);
    expect(css).toContain("100dvh");
  });

  it("pads for the safe area", () => {
    expect(css).toContain("safe-area-inset-bottom");
  });

  it("sets a 16px minimum on inputs so iOS does not zoom on focus", () => {
    expect(css).toMatch(/input[\s\S]*font-size:\s*16px/);
  });

  it("uses tabular numerals for money", () => {
    expect(css).toContain("tabular-nums");
  });
});

describe("document", () => {
  it("declares Spanish as the page language", () => {
    expect(layout).toContain('lang="es-CO"');
  });

  it("opts into the full viewport so safe-area insets resolve", () => {
    expect(layout).toContain("viewport-fit");
  });
});
