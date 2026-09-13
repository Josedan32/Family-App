import { afterEach, describe, expect, it, vi } from "vitest";

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
    set: (name: string, value: string) => cookieStore.set(name, value),
    delete: (name: string) => cookieStore.delete(name),
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

  it("sends the viewer to /login once the refresh attempt also fails, instead of throwing", async () => {
    cookieStore.set("fh_access", "expired-access");
    cookieStore.set("fh_refresh", "expired-refresh");

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/auth/refresh")) {
        return problem(401, "unauthorized", "Sesión expirada");
      }
      return problem(401, "unauthorized", "Sesión expirada");
    });
    vi.stubGlobal("fetch", fetchMock);

    const pageFetch = await loadPageFetch();
    await expect(pageFetch("/dashboard")).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("rethrows non-401 errors instead of redirecting", async () => {
    cookieStore.set("fh_access", "valid-access");
    vi.stubGlobal("fetch", vi.fn(async () => problem(404, "not_found", "No encontrado")));

    const pageFetch = await loadPageFetch();
    await expect(pageFetch("/members/x")).rejects.toMatchObject({ status: 404 });
    expect(redirect).not.toHaveBeenCalled();
  });
});
