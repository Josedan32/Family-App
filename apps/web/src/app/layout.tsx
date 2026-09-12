import type { Metadata, Viewport } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
