"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TABS } from "./BottomTabBar";
import type { CurrentUser } from "./types";

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
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
      <div className="mt-auto flex items-center gap-2.5 border-t border-border px-3 pt-4">
        {user.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photo_url}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold text-text-muted"
          >
            {user.display_name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="truncate text-sm font-medium">{user.display_name}</span>
      </div>
    </nav>
  );
}
