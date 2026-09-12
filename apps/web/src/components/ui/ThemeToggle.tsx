"use client";

import { IconMoon, IconSun } from "@/components/ui/Icons";
import { THEME_STORAGE_KEY } from "@/lib/theme";

function isDark(): boolean {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "dark") return true;
  if (explicit === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function toggleTheme() {
  const next = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Private browsing can throw on write — the toggle still works for
    // this page load, it just won't be remembered next visit.
  }
}

/**
 * Both icons always render; CSS (globals.css) decides which one shows, so
 * there's no client/server state to disagree on and no flash on mount.
 */
export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Cambiar entre modo claro y oscuro"
      className="fixed left-3 top-[calc(0.75rem+env(safe-area-inset-top,0px))] z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text shadow-sm active:bg-surface-sunken"
    >
      <IconSun className="theme-toggle-sun" />
      <IconMoon className="theme-toggle-moon" />
    </button>
  );
}
