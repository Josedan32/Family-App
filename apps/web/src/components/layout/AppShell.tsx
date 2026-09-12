import { BottomTabBar } from "./BottomTabBar";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh]">
      <Sidebar />
      <main className="scroll-area mx-auto w-full max-w-content px-4 pb-24 pt-4 md:px-6 md:pb-6">
        {children}
      </main>
      <BottomTabBar />
    </div>
  );
}
