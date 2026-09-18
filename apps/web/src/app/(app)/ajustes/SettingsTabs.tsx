"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/ajustes/perfil", label: "Perfil" },
  { href: "/ajustes/privacidad", label: "Privacidad" },
  { href: "/ajustes/visualizacion", label: "Visualización" },
] as const;

/** Link-based, not state-based: each tab is its own bookmarkable route, so
 * this only decides which one looks active for the current URL. */
export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <div role="tablist" className="flex gap-1 rounded-2xl border border-border bg-surface-sunken p-1">
      {TABS.map((tab) => {
        const selected = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={selected}
            className={`flex min-h-[44px] flex-1 items-center justify-center rounded-[10px] text-[0.9375rem] font-medium ${
              selected ? "bg-surface text-brand shadow-sm" : "text-text-muted"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
