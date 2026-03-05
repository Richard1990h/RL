"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageCircle,
  PlusCircle,
  Wallet,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Crown,
  Lock,
  Shield,
} from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useFriendsStore } from "@/stores/friends-store";
import { useState, useEffect, useCallback } from "react";

interface NavItem {
  label: string;
  icon: typeof Home;
  href: string;
  badge?: number;
  requiresAuth?: boolean;
  requiresOwner?: boolean;
  requiresGoLiveEligibility?: boolean;
}

const navItems: NavItem[] = [
  { label: "Home", icon: Home, href: "/home" },
  { label: "Messages", icon: MessageCircle, href: "/messages", badge: 0, requiresAuth: true },
  { label: "FiveM", icon: Shield, href: "/fivem" },
  { label: "Upload/Stream", icon: PlusCircle, href: "/upload-stream", requiresAuth: true },
  { label: "Services", icon: Briefcase, href: "/services", requiresAuth: true },
  { label: "Wallet", icon: Wallet, href: "/wallet", requiresAuth: true },
  { label: "Settings", icon: Settings, href: "/settings", requiresAuth: true },
  { label: "Admin", icon: Crown, href: "/admin", requiresAuth: true, requiresOwner: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, collapseSidebar } = useUIStore();
  const { currentUser, isLoggedIn, logout } = useAuthStore();
  const { incomingCount, fetchIncomingRequests } = useFriendsStore();
  const [goLiveEligible, setGoLiveEligible] = useState(false);
  const [goLiveInfo, setGoLiveInfo] = useState<{ videos: number; views: number; likes: number } | null>(null);

  const checkGoLiveEligibility = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const res = await fetch("/api/live/eligibility", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setGoLiveEligible(data.eligible);
        setGoLiveInfo({ videos: data.videos, views: data.views, likes: data.likes ?? 0 });
      }
    } catch {}
  }, [isLoggedIn]);

  useEffect(() => {
    checkGoLiveEligibility();
  }, [checkGoLiveEligibility]);

  useEffect(() => {
    if (isLoggedIn) fetchIncomingRequests();
  }, [isLoggedIn, fetchIncomingRequests]);

  const visibleNavItems = navItems.filter((item) => {
    if (item.requiresOwner && !(currentUser as any)?.isOwner) return false;
    if (item.requiresAuth && !isLoggedIn) return false;
    return true;
  }).map((item) => {
    if (item.label === "Messages") return { ...item, badge: incomingCount };
    return item;
  });

  const isActive = (href: string) => {
    if (href === "/home") return pathname === "/home" || pathname === "/";
    if (href.includes("?")) return pathname === href.split("?")[0];
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <aside
      className={`fixed right-0 top-0 z-40 hidden h-screen flex-col border-l border-border/80 bg-bg-surface/92 backdrop-blur-lg transition-all duration-300 lg:flex ${
        sidebarCollapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border/80 px-4">
        <Link href="/home" className="flex items-center gap-3">
          <img src="/logo.png?v=3" alt="Rally Live" className="h-9 w-9 object-contain" />
          {!sidebarCollapsed && (
            <span className="text-lg font-semibold text-text">Rally Live</span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="flex flex-col gap-1 px-2">
          {visibleNavItems.map((item) => {
            const active = isActive(item.href);
            const isBugTesterOrOwner = (currentUser as any)?.isOwner || (currentUser as any)?.role === "BUG_TESTER";
            const isLocked = item.requiresGoLiveEligibility && !goLiveEligible && !isBugTesterOrOwner;

            if (isLocked) {
              return (
                <li key={item.label}>
                  <div
                    className="group relative cursor-not-allowed items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-text-muted/50"
                    title={sidebarCollapsed
                      ? `${item.label} (Locked)`
                      : `Requires 5 videos, 100 impression views & 50 likes (${goLiveInfo?.videos ?? 0}/5 videos, ${goLiveInfo?.views ?? 0}/100 impression views, ${goLiveInfo?.likes ?? 0}/50 likes)`
                    }
                  >
                    <Lock size={20} className="text-text-muted/40" />
                    {!sidebarCollapsed && (
                      <span className="flex flex-1 items-center justify-between">
                        <span>{item.label}</span>
                        <span className="text-[10px] text-text-muted/40">
                          {goLiveInfo ? `${goLiveInfo.videos}/5 vids` : "Locked"}
                        </span>
                      </span>
                    )}
                  </div>
                </li>
              );
            }

            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className={`group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary/30 bg-primary/12 text-text shadow-[0_10px_20px_rgba(37,99,235,0.2)]"
                      : "border-transparent text-text-secondary hover:border-border hover:bg-bg-surface2/70 hover:text-text"
                  }`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  {/* Active indicator - right gradient border */}
                  {active && (
                    <span
                      className="absolute right-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-l-full"
                      style={{
                        background:
                          "linear-gradient(180deg, var(--color-gradient-start), var(--color-gradient-end))",
                      }}
                    />
                  )}
                  <item.icon
                    size={20}
                    className={active ? "text-primary" : "text-text-muted group-hover:text-text-secondary"}
                  />
                  {!sidebarCollapsed && (
                    <span className="flex flex-1 items-center justify-between">
                      <span>{item.label}</span>
                      {(item as any).badge > 0 && (
                        <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
                          {(item as any).badge}
                        </span>
                      )}
                    </span>
                  )}
                  {sidebarCollapsed && (item as any).badge > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={collapseSidebar}
        className="mx-2 mb-2 flex items-center justify-center rounded-xl border border-transparent p-2 text-text-muted transition-colors hover:border-border hover:bg-bg-surface2 hover:text-text"
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* User section */}
      <div className="border-t border-border/80 p-3">
        {currentUser ? (
          <div className={`flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : ""}`}>
            <Link href={`/profile/${currentUser.username}`}>
              <img
                src={currentUser.avatarUrl ?? undefined}
                alt={currentUser.displayName}
                className="h-8 w-8 shrink-0 rounded-full object-cover hover:opacity-80 transition-opacity"
              />
            </Link>
            {!sidebarCollapsed && (
              <div className="flex flex-1 items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {currentUser.displayName}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    @{currentUser.username}
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-surface2 hover:text-danger"
                  aria-label="Log out"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className={`flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark ${
              sidebarCollapsed ? "px-2" : ""
            }`}
          >
            {sidebarCollapsed ? "In" : "Sign In"}
          </Link>
        )}
      </div>
    </aside>
  );
}
