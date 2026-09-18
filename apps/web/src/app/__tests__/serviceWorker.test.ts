import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORIGIN = "https://familia.example.app";
const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

type Handler = (event: unknown) => void;

/** Runs the real sw.js against a fake worker scope and hands back its fetch handler. */
function loadWorker() {
  const handlers: Record<string, Handler> = {};
  const scope = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: { claim: vi.fn(() => Promise.resolve()) },
  };
  const caches = {
    open: vi.fn(() => Promise.resolve({ addAll: vi.fn(), put: vi.fn() })),
    match: vi.fn(() => Promise.resolve(undefined)),
    keys: vi.fn(() => Promise.resolve([])),
    delete: vi.fn(),
  };
  const fetchStub = vi.fn(() => Promise.resolve(new Response("")));
  new Function("self", "caches", "fetch", source)(scope, caches, fetchStub);
  return handlers.fetch;
}

function intercepts(path: string, method = "GET", mode: RequestMode = "cors"): boolean {
  const respondWith = vi.fn();
  loadWorker()({
    request: { url: new URL(path, ORIGIN).href, method, mode },
    respondWith,
  });
  return respondWith.mock.calls.length > 0;
}

describe("service worker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never serves a page from cache", () => {
    // A server-rendered page carries the figures the viewer was allowed to see
    // at render time. Cached, it outlives a switch to Private, and on a shared
    // tablet it shows the previous member's finances to the next one.
    for (const page of ["/", "/finanzas", "/hogar/miembros/abc", "/tareas"]) {
      expect(intercepts(page, "GET", "navigate"), page).toBe(false);
    }
  });

  it("never serves a React Server Component payload from cache", () => {
    expect(intercepts("/finanzas?_rsc=1x2y3")).toBe(false);
  });

  it("never touches the proxy or the session route", () => {
    expect(intercepts("/api/proxy/me/finance/summary")).toBe(false);
    expect(intercepts("/api/session", "POST")).toBe(false);
  });

  it("caches content-hashed build output, whose bytes never change", () => {
    expect(intercepts("/_next/static/chunks/app-3f9a1c.js")).toBe(true);
  });

  it("leaves other origins alone", () => {
    expect(intercepts("https://fonts.gstatic.com/s/inter.woff2")).toBe(false);
  });
});
