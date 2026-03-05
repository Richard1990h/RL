"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageCircle,
  PlusCircle,
  Wallet,
  Settings,
  LogOut,
  Briefcase,
  Crown,
  X,
} from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";

interface NavItem {
  label: string;
  icon: typeof Home;
  href: string;
  section: "main" | "creator" | "account";
  requiresAuth?: boolean;
  requiresOwner?: boolean;
}

const navItems: NavItem[] = [
  { label: "Home", icon: Home, href: "/home", section: "main" },
  { label: "Messages", icon: MessageCircle, href: "/messages", section: "main", requiresAuth: true },
  { label: "Upload/Stream", icon: PlusCircle, href: "/upload-stream", section: "creator", requiresAuth: true },
  { label: "Services", icon: Briefcase, href: "/services", section: "creator", requiresAuth: true },
  { label: "Wallet", icon: Wallet, href: "/wallet", section: "account", requiresAuth: true },
  { label: "Settings", icon: Settings, href: "/settings", section: "account", requiresAuth: true },
  { label: "Admin", icon: Crown, href: "/admin", section: "account", requiresAuth: true, requiresOwner: true },
];

const sectionLabels: Record<string, string> = {
  main: "Main",
  creator: "Creator Tools",
  account: "Account",
};

export function MobileDrawer() {
  const pathname = usePathname();
  const { mobileDrawerOpen, setMobileDrawerOpen } = useUIStore();
  const { currentUser, isLoggedIn, logout } = useAuthStore();

  const close = useCallback(() => setMobileDrawerOpen(false), [setMobileDrawerOpen]);

  // Close on route change
  useEffect(() => {
    close();
  }, [pathname, close]);

  // Prevent body scroll when open
  useEffect(() => {
    if (mobileDrawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileDrawerOpen]);

  const visibleNavItems = navItems.filter((item) => {
    if (item.requiresOwner && !(currentUser as any)?.isOwner) return false;
    if (item.requiresAuth && !isLoggedIn) return false;
    return true;
  });

  const isActive = (href: string) => {
    if (href === "/home") return pathname === "/home" || pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const sections = ["main", "creator", "account"] as const;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          mobileDrawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={close}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 z-[90] h-full w-80 border-l border-border/80 bg-bg-surface/95 backdrop-blur-xl flex flex-col transition-transform duration-300 ease-in-out md:hidden ${
          mobileDrawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/80 px-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png?v=3" alt="Rally Live" className="h-8 w-8 object-contain" />
            <span className="text-lg font-semibold text-text">Rally Live</span>
          </div>
          <button
            onClick={close}
            className="rounded-xl p-2 text-text-muted transition-colors hover:bg-bg-surface2 hover:text-text"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* User profile section */}
        {currentUser && (
          <Link
            href={`/profile/${currentUser.username}`}
            className="flex items-center gap-3 border-b border-border/80 px-4 py-4 transition-colors hover:bg-bg-surface2/50"
          >
            <img
              src={currentUser.avatarUrl ?? undefined}
              alt={currentUser.displayName}
              className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/30"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text truncate">
                {currentUser.displayName}
              </p>
              <p className="text-xs text-text-muted truncate">
                @{currentUser.username}
              </p>
            </div>
          </Link>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2">
          {sections.map((section) => {
            const items = visibleNavItems.filter((i) => i.section === section);
            if (items.length === 0) return null;
            return (
              <div key={section} className="mb-2">
                <div className="px-4 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  {sectionLabels[section]}
                </div>
                <ul className="px-2">
                  {items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <li key={item.label}>
                        <Link
                          href={item.href}
                          className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                            active
                              ? "border-primary/30 bg-primary/12 text-primary-light"
                              : "border-transparent text-text-secondary hover:border-border hover:bg-bg-surface2/50 hover:text-text"
                          }`}
                        >
                          <item.icon
                            size={20}
                            className={active ? "text-primary-light" : "text-text-muted"}
                          />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="shrink-0 border-t border-border/80 p-3">
          {currentUser ? (
            <button
              onClick={() => {
                close();
                logout();
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-danger/20 px-3 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
            >
              <LogOut size={20} />
              <span>Log Out</span>
            </button>
          ) : (
            <Link
              href="/login"
              className="flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
