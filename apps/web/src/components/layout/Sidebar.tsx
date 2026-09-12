"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TABS } from "./BottomTabBar";

export function Sidebar() {
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
                <span aria-hidden="true">{tab.icon}</span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
