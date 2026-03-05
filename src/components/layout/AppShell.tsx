"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/stores/ui-store";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomTabs } from "./BottomTabs";
import { OfflineStatusBar } from "./OfflineStatusBar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { sidebarCollapsed } = useUIStore();
  const [immersiveVideo, setImmersiveVideo] = useState(false);

  useEffect(() => {
    const update = () => {
      setImmersiveVideo(document.documentElement.classList.contains("video-immersive"));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const isImmersive = immersiveVideo;
  const isSidebarCollapsed = sidebarCollapsed;

  return (
    <div
      suppressHydrationWarning
      data-app-shell
      className={`relative h-[100dvh] overflow-hidden bg-bg ${isImmersive ? "fixed inset-0 w-screen" : ""}`}
    >
      {!isImmersive && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(6,182,212,0.1),transparent_26%)]"
        />
      )}
      {/* Desktop sidebar */}
      {!isImmersive && <Sidebar />}

      {/* Main area */}
      <div
        className={`relative z-10 flex h-[100dvh] flex-col overflow-hidden transition-all duration-300 ${
          isSidebarCollapsed ? "lg:mr-16" : "lg:mr-60"
        }`}
      >
        {/* Top bar */}
        {!isImmersive && <TopBar />}
        {!isImmersive && (
          <div className="hidden lg:block">
            <OfflineStatusBar />
          </div>
        )}

        {/* Page content */}
        <main
          data-app-main
          className={`flex-1 overscroll-contain ${
            isImmersive ? "overflow-hidden pb-0" : "overflow-y-auto pb-24 lg:pb-0"
          }`}
        >
          {isImmersive ? (
            children
          ) : (
            <div className="mx-auto w-full lg:max-w-[1720px] px-0 pb-5 pt-2 lg:px-6 lg:pb-8 lg:pt-3">{children}</div>
          )}
        </main>
      </div>

      {/* Mobile bottom tabs */}
      {!isImmersive && <BottomTabs />}

    </div>
  );
}
