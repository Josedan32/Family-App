import { BottomTabBar } from "./BottomTabBar";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    // h-[100dvh] + overflow-hidden caps the shell to the viewport so only
    // <main> scrolls internally — the sidebar (a flex sibling, not part of
    // that scroll container) stays put instead of scrolling away with it.
    <div className="flex h-[100dvh] overflow-hidden">
      <Sidebar />
      <main className="scroll-area mx-auto w-full max-w-content px-4 pb-24 pt-4 md:px-6 md:pb-6">
        {children}
      </main>
      <BottomTabBar />
    </div>
  );
}
