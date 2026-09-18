"use client";

import { useSyncExternalStore } from "react";

/** How lists render: the usual cards, or a denser table. */
export type ViewMode = "cards" | "table";

export const VIEW_MODE_STORAGE_KEY = "fh-view-mode";
const CHANGE_EVENT = "fh-view-mode-change";

function read(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "table" ? "table" : "cards";
  } catch {
    // Private browsing can throw on access: the default still works.
    return "cards";
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  // Another tab changed it.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Per device on purpose: a table reads well on a laptop and a card on a
 * phone, and the same person uses both. The server always renders cards, so
 * the first paint never mismatches what hydration expects.
 */
export function useViewMode(): ViewMode {
  return useSyncExternalStore(subscribe, read, () => "cards");
}

export function setViewMode(mode: ViewMode): void {
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Not remembered, but still applied to this page below.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
