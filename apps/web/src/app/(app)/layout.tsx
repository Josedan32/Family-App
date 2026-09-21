import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import type { CurrentUser } from "@/components/layout/types";
import { ApiError } from "@/lib/api/errors";
import { apiFetch } from "@/lib/api/server";
import { Providers } from "@/lib/query";

/**
 * A 404 here means no active membership: the account registered but never
 * created or joined a household, or was removed from one. Any other failure
 * is left for the page to report.
 */
async function belongsToHousehold(): Promise<boolean> {
  try {
    await apiFetch("/households/current");
    return true;
  } catch (error) {
    return !(error instanceof ApiError && error.status === 404);
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, inHousehold] = await Promise.all([
    apiFetch<CurrentUser>("/auth/me").catch(() => null),
    belongsToHousehold(),
  ]);
  if (!user) redirect("/login");
  if (!inHousehold) redirect("/onboarding/hogar");

  return (
    <Providers>
      <AppShell user={user}>{children}</AppShell>
      <InstallPrompt />
    </Providers>
  );
}
