"use client";

import { pushToast } from "@/lib/toast";

import { ApiError, type Problem } from "./errors";

/** Browser fetch. Goes through the proxy route so the token stays httpOnly. */
export async function clientFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/proxy${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const problem =
      (body as Problem) ?? { type: "unknown", title: "Ocurrió un error", status: response.status };
    // A toast fires for every failed request so a failure is never silent,
    // even on screens that don't render their own inline error state.
    pushToast({ message: problem.title, type: "danger" });
    throw new ApiError(problem);
  }
  return body as T;
}
