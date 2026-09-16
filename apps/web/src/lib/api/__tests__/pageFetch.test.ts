import { afterEach, describe, expect, it, vi } from "vitest";

const cookieStore = new Map<string, string>();

/**
 * Mirrors the real restriction: Next.js throws if `cookies().set()` is called
 * outside a Server Action or Route Handler. `apiFetch`/`pageFetch` run during
 * Server Component render, so if either ever tries to write a cookie, this
 * mock throws exactly like the framework would.
 */
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
    set: () => {
      throw new Error(
        "Cookies can only be modified in a Server Action or Route Handler.",
      );
    },
    delete: () => {
      throw new Error(
        "Cookies can only be modified in a Server Action or Route Handler.",
      );
    },
  }),
}));

const redirect = vi.fn((path: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${path}`), { digest: "NEXT_REDIRECT" });
});
vi.mock("next/navigation", () => ({ redirect }));

async function loadPageFetch() {
  const mod = await import("../server");
  return mod.pageFetch;
}

const problem = (status: number, type: string, title: string) => ({
  ok: false,
  status,
  json: async () => ({ type, title, status }),
});

describe("pageFetch", () => {
  afterEach(() => {
    cookieStore.clear();
    redirect.mockClear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns the payload on success", async () => {
    cookieStore.set("fh_access", "valid-access");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ hello: "world" }) })),
    );

    const pageFetch = await loadPageFetch();
    await expect(pageFetch("/dashboard")).resolves.toEqual({ hello: "world" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to /login on an expired token without attempting to write cookies", async () => {
    cookieStore.set("fh_access", "expired-access");
    cookieStore.set("fh_refresh", "still-valid-refresh");

    const fetchMock = vi.fn(async (url: string) => {
      void url;
      return problem(401, "unauthorized", "Sesión expirada");
    });
    vi.stubGlobal("fetch", fetchMock);

    const pageFetch = await loadPageFetch();
    await expect(pageFetch("/dashboard")).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
    // A render-time refresh attempt would call /auth/refresh and then try to
    // write the new pair via setSession — neither may happen here.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("/auth/refresh");
  });

  it("rethrows non-401 errors instead of redirecting", async () => {
    cookieStore.set("fh_access", "valid-access");
    vi.stubGlobal("fetch", vi.fn(async () => problem(404, "not_found", "No encontrado")));

    const pageFetch = await loadPageFetch();
    await expect(pageFetch("/members/x")).rejects.toMatchObject({ status: 404 });
    expect(redirect).not.toHaveBeenCalled();
  });
});
