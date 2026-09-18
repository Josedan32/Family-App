"use client";

import { useSyncExternalStore } from "react";

/**
 * A media query that is safe to read during render. The server, which has no
 * screen, and the first client render both use `serverValue`; the real answer
 * follows right after hydration — so the HTML never disagrees with React.
 */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () =>
      typeof window.matchMedia === "function" ? window.matchMedia(query).matches : serverValue,
    () => serverValue,
  );
}
