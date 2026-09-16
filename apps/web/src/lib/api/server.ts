import { redirect } from "next/navigation";

import { ApiError, type Problem } from "./errors";
import { getAccessToken, getRefreshToken, setSession } from "../session";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8001/api/v1";

async function request<T>(path: string, token: string | undefined, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    // Financial data is never served stale.
    cache: "no-store",
  });

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      (body as Problem) ?? {
        type: "unknown",
        title: "Ocurrió un error",
        status: response.status,
      },
    );
  }
  return body as T;
}

/**
 * Server-side fetch with the current access token. No cookie writes here —
 * this runs during Server Component render (directly, or via `pageFetch`),
 * where Next.js forbids mutating cookies. A 401 is left for the caller.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const access = await getAccessToken();
  return request<T>(path, access, init);
}

/**
 * For Server Component reads. A 401 means the session is gone (there is no
 * legal way to refresh it here), so we leave for the login screen instead of
 * letting the exception surface as an unhandled render error. Every other
 * status rethrows for the caller (or the route's error.tsx boundary) to turn
 * into a toast.
 */
export async function pageFetch<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await apiFetch<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    throw error;
  }
}

/**
 * Fetch with one transparent refresh attempt, persisting the new pair on
 * success. Only legal to call from a Server Action or Route Handler (e.g. the
 * `/api/proxy` handler backing client-side reads) — never from a Server
 * Component render, since it writes cookies.
 */
export async function apiFetchWithRefresh<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await apiFetch<T>(path, init);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;

    const refresh = await getRefreshToken();
    if (!refresh) throw error;

    const pair = await request<{ access_token: string; refresh_token: string }>(
      "/auth/refresh",
      undefined,
      { method: "POST", body: JSON.stringify({ refresh_token: refresh }) },
    );
    await setSession(pair.access_token, pair.refresh_token);
    return await request<T>(path, pair.access_token, init);
  }
}
