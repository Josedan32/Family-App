import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

const apiFetch = vi.fn();
vi.mock("@/lib/api/server", () => ({ apiFetch: (path: string) => apiFetch(path) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import AppLayout from "../(app)/layout";

const USER = { id: "u1", display_name: "Daniel", photo_url: null };

function respond(routes: Record<string, unknown>) {
  apiFetch.mockImplementation(async (path: string) => {
    const result = routes[path];
    if (result instanceof Error) throw result;
    return result;
  });
}

const problem = (status: number) =>
  new ApiError({ type: status === 404 ? "not_found" : "unknown", title: "x", status });

describe("(app) layout", () => {
  beforeEach(() => apiFetch.mockReset());

  it("sends an account that belongs to no household to onboarding", async () => {
    // Registered but never created or joined one, or was removed from it:
    // every /me read would 404 and the whole app would be error toasts.
    respond({ "/auth/me": USER, "/households/current": problem(404) });

    await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT /onboarding/hogar");
  });

  it("sends a visitor with no session to login", async () => {
    respond({ "/auth/me": problem(401), "/households/current": problem(401) });

    await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT /login");
  });

  it("lets a member of a household in", async () => {
    respond({ "/auth/me": USER, "/households/current": { id: "h1" } });

    await expect(AppLayout({ children: null })).resolves.toBeTruthy();
  });

  it("does not lock a member out over an unrelated failure", async () => {
    // A 500 or a network blip is the page's to report, not a reason to
    // pretend the member has no household.
    respond({ "/auth/me": USER, "/households/current": problem(500) });

    await expect(AppLayout({ children: null })).resolves.toBeTruthy();
  });
});
