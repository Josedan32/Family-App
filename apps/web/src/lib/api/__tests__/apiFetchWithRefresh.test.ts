import { afterEach, describe, expect, it, vi } from "vitest";

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
    set: (name: string, value: string) => cookieStore.set(name, value),
    delete: (name: string) => cookieStore.delete(name),
  }),
}));

async function loadApiFetchWithRefresh() {
  const mod = await import("../server");
  return mod.apiFetchWithRefresh;
}

const problem = (status: number, type: string, title: string) => ({
  ok: false,
  status,
  json: async () => ({ type, title, status }),
});

describe("apiFetchWithRefresh", () => {
  afterEach(() => {
    cookieStore.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("transparently refreshes and persists the new pair when the access token is expired", async () => {
    cookieStore.set("fh_access", "expired-access");
    cookieStore.set("fh_refresh", "still-valid-refresh");

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/auth/refresh")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: "new-access", refresh_token: "new-refresh" }),
        };
      }
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth === "Bearer new-access") {
        return { ok: true, status: 200, json: async () => ({ hello: "world" }) };
      }
      return problem(401, "unauthorized", "Sesión expirada");
    });
    vi.stubGlobal("fetch", fetchMock);

    const apiFetchWithRefresh = await loadApiFetchWithRefresh();
    await expect(apiFetchWithRefresh("/dashboard")).resolves.toEqual({ hello: "world" });
    expect(cookieStore.get("fh_access")).toBe("new-access");
    expect(cookieStore.get("fh_refresh")).toBe("new-refresh");
  });

  it("rethrows the original 401 when the refresh token is also invalid", async () => {
    cookieStore.set("fh_access", "expired-access");
    cookieStore.set("fh_refresh", "expired-refresh");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => problem(401, "unauthorized", "Sesión expirada")),
    );

    const apiFetchWithRefresh = await loadApiFetchWithRefresh();
    await expect(apiFetchWithRefresh("/dashboard")).rejects.toMatchObject({ status: 401 });
  });
});
