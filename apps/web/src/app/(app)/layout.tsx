import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { InstallPrompt } from "@/components/layout/InstallPrompt";
import { apiFetch } from "@/lib/api/server";
import { Providers } from "@/lib/query";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  try {
    await apiFetch("/auth/me");
  } catch {
    redirect("/login");
  }
  return (
    <Providers>
      <AppShell>{children}</AppShell>
      <InstallPrompt />
    </Providers>
  );
}
