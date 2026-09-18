import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import type { CurrentUser } from "@/components/layout/types";
import { apiFetch } from "@/lib/api/server";
import { Providers } from "@/lib/query";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user: CurrentUser;
  try {
    user = await apiFetch<CurrentUser>("/auth/me");
  } catch {
    redirect("/login");
  }
  return (
    <Providers>
      <AppShell user={user}>{children}</AppShell>
      <InstallPrompt />
    </Providers>
  );
}
