import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), "public/manifest.webmanifest"), "utf8"),
);

describe("manifest", () => {
  it("is installable as a standalone app", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.name).toBe("Family Hub");
    expect(manifest.start_url).toBe("/");
  });

  it("ships a maskable icon", () => {
    expect(
      manifest.icons.some((icon: { purpose?: string }) => icon.purpose?.includes("maskable")),
    ).toBe(true);
  });

  it("declares the brand theme color", () => {
    expect(manifest.theme_color).toBe("#0F766E");
  });
});

// The service worker's fetch handling is tested by behaviour in serviceWorker.test.ts.
