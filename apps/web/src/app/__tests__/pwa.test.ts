import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), "public/manifest.webmanifest"), "utf8"),
);
const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

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

describe("service worker", () => {
  it("never caches API responses", () => {
    // A cached financial response outlives the visibility setting that
    // permitted it. The app shell is cacheable; data is not.
    expect(sw).toContain("/api/");
    expect(sw).toMatch(/return;|fetch\(request\)/);
  });

  it("does not put API responses into the cache", () => {
    const putCalls = sw.match(/cache\.put\(/g) ?? [];
    expect(putCalls.length).toBeGreaterThan(0);
    // The guard must appear before any cache.put in the fetch handler.
    expect(sw.indexOf("/api/")).toBeLessThan(sw.indexOf("cache.put("));
  });
});
