"use client";

import { useUIStore } from "@/stores/ui-store";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomTabs } from "./BottomTabs";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { sidebarCollapsed } = useUIStore();

  return (
    <div className="min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main area */}
      <div
        className={`flex min-h-screen flex-col transition-all duration-300 ${
          sidebarCollapsed ? "md:mr-16" : "md:mr-60"
        }`}
      >
        {/* Top bar */}
        <TopBar />

        {/* Page content */}
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <BottomTabs />

    </div>
  );
}
