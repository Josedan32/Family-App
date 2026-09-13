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
 * Server-side fetch with one transparent refresh attempt.
 *
 * Reads behind visibility rules happen here, in Server Components, so data the
 * viewer may not see never reaches their browser at all.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const access = await getAccessToken();
  try {
    return await request<T>(path, access, init);
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
