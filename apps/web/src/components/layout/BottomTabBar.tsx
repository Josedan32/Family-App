"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const TABS = [
  { href: "/", label: "Inicio", icon: "🏠" },
  { href: "/finanzas", label: "Finanzas", icon: "💰" },
  { href: "/aportes", label: "Aportes", icon: "🤝" },
  { href: "/hogar", label: "Hogar", icon: "👨‍👩‍👦" },
  { href: "/ajustes/privacidad", label: "Ajustes", icon: "⚙️" },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface md:hidden"
    >
      <ul className="flex justify-around">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-2 text-xs ${
                  active ? "text-brand" : "text-text-muted"
                }`}
              >
                <span aria-hidden="true" className="text-lg">
                  {tab.icon}
                </span>
                <span className="whitespace-nowrap" style={{ letterSpacing: "-0.01em" }}>
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
