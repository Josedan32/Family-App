import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ToastStack } from "@/components/ui/ToastStack";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Family Hub",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Family Hub" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Renders <meta name="viewport" content="...viewport-fit=cover">, required
  // for env(safe-area-inset-*) to resolve to anything but 0.
  viewportFit: "cover",
  themeColor: "#0F766E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body>
        {/* Runs before paint so a stored theme applies immediately — without
            this, the page would flash the system theme first. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`try {
            var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
            if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
          } catch (e) {}`}
        </Script>
        <ThemeToggle />
        {children}
        <ToastStack />
      </body>
    </html>
  );
}
