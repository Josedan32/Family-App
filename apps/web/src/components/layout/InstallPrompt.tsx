"use client";

import { useEffect, useState } from "react";

const BODY_CLASS = "fh-install-banner-visible";

/**
 * Registers the service worker and offers "Añadir a inicio" once.
 *
 * Phase 3 needs the app installed for Web Push — iOS delivers it only to PWAs
 * on the Home Screen — so the habit is worth establishing early.
 */
export function InstallPrompt() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const seen = document.cookie.includes("fh_install_seen=1");
    // Must stay in the Effect, not a lazy useState initializer: matchMedia
    // and the cookie are unavailable during SSR, and revealing the prompt
    // only after mount (rather than on the server-rendered pass) is what
    // keeps hydration from mismatching.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(standalone || seen);
  }, []);

  useEffect(() => {
    // A fixed banner over scrollable content will eventually sit right
    // where a real page's own content — or a browser scrolling a focused
    // element into view — ends up, silently eating the tap meant for it.
    // Reserving extra space in <main> while the banner is up (globals.css)
    // is what keeps content from ever landing underneath it.
    document.body.classList.toggle(BODY_CLASS, !dismissed);
    return () => document.body.classList.remove(BODY_CLASS);
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <div className="fixed inset-x-2 bottom-[calc(9.5rem+env(safe-area-inset-bottom,0px))] z-20 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3 shadow-lg md:hidden">
      <p className="text-sm">Añade Family Hub a tu pantalla de inicio.</p>
      <button
        onClick={() => {
          document.cookie = "fh_install_seen=1; path=/; max-age=31536000";
          setDismissed(true);
        }}
        className="text-sm text-brand"
      >
        Entendido
      </button>
    </div>
  );
}
