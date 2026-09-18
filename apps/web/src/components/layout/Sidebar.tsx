"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

import { Avatar } from "@/components/ui/Avatar";
import { IconLogout } from "@/components/ui/Icons";
import { logout } from "@/lib/auth";

import { TABS } from "./BottomTabBar";
import type { CurrentUser } from "./types";

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav
      aria-label="Navegación lateral"
      className="hidden w-64 shrink-0 flex-col gap-1 border-r border-border bg-surface p-6 md:flex"
    >
      <div className="mb-3 flex items-center gap-2.5 px-3 pb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand text-sm font-bold text-brand-contrast">
          FH
        </div>
        <div>
          <div className="text-sm font-semibold">Family Hub</div>
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[44px] items-center gap-3 rounded-[10px] px-3 text-[0.9375rem] font-medium ${
                  active ? "bg-surface-sunken text-brand" : "text-text-muted"
                }`}
              >
                <tab.Icon />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex items-center gap-1 border-t border-border pt-4">
        <Link
          href="/ajustes/perfil"
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-3"
        >
          <Avatar displayName={user.display_name} photoUrl={user.photo_url} seed={user.id} size="sm" />
          <span className="truncate text-sm font-medium">{user.display_name}</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="flex min-h-[44px] min-w-[44px] flex-none items-center justify-center rounded-[10px] text-text-muted active:bg-surface-sunken"
        >
          <IconLogout />
        </button>
      </div>
    </nav>
  );
}
