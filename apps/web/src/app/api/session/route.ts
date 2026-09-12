import { NextResponse } from "next/server";

import { clearSession, getRefreshToken, setSession } from "@/lib/session";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8001/api/v1";

export async function POST(request: Request) {
  const { action, ...payload } = await request.json();
  const path = action === "register" ? "/auth/register" : "/auth/login";

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(body, { status: response.status });
  }

  await setSession(body.access_token, body.refresh_token);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const refresh = await getRefreshToken();
  if (refresh) {
    await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    }).catch(() => undefined);
  }
  await clearSession();
  return NextResponse.json({ ok: true });
}
