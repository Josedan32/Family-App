import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

/** Every .tsx under src/, so class usage can be checked against the tokens. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("design tokens", () => {
  it("defines every semantic color token", () => {
    for (const token of [
      "--bg", "--surface", "--surface-sunken", "--border", "--text", "--text-muted",
      "--brand", "--brand-contrast", "--brand-pressed", "--brand-tint",
      "--income", "--expense", "--savings", "--debt",
      "--private", "--danger", "--warning", "--success",
    ]) {
      expect(css).toContain(token);
    }
  });

  it("defines a token for every semantic color class the components use", () => {
    // Tailwind emits nothing for a class whose token does not exist, so the
    // element silently loses that colour and no other test notices. This is
    // how `bg-brand-pressed` and `bg-brand-tint` shipped dead.
    const SEMANTIC = /\b(?:bg|text|border|fill|stroke)-((?:brand|surface|private|income|expense|savings|debt|danger|warning|success)(?:-[a-z]+)*)\b/g;

    const missing = new Set<string>();
    for (const file of sourceFiles(join(process.cwd(), "src"))) {
      const source = readFileSync(file, "utf8");
      for (const [, token] of source.matchAll(SEMANTIC)) {
        if (!css.includes(`--color-${token}:`)) missing.add(token);
      }
    }

    expect([...missing].sort()).toEqual([]);
  });

  it("keeps the sunken surface distinct from the background in dark mode", () => {
    // A sunken panel painted the same colour as the page behind it is an
    // invisible panel. They were identical (#1C1917) until the design caught it.
    const dark = css.slice(css.indexOf('[data-theme="dark"]'));
    const bg = dark.match(/--bg:\s*(#[0-9A-Fa-f]{6})/)?.[1];
    const sunken = dark.match(/--surface-sunken:\s*(#[0-9A-Fa-f]{6})/)?.[1];

    expect(bg).toBeTruthy();
    expect(sunken).toBeTruthy();
    expect(sunken).not.toBe(bg);
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
