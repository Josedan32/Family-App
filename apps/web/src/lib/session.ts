import { cookies } from "next/headers";

/**
 * Tokens live in httpOnly cookies, never in web storage.
 *
 * A refresh token kept in the browser's own storage APIs is readable by any
 * script that gets injected into the page. httpOnly means the browser will
 * send it and JavaScript cannot read it.
 */

const ACCESS = "fh_access";
const REFRESH = "fh_refresh";

const BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function setSession(access: string, refresh: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS, access, { ...BASE, maxAge: 60 * 15 });
  jar.set(REFRESH, refresh, { ...BASE, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}

export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH)?.value;
}
