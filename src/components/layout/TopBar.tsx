"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Menu, Search, Bell, X, CircleDollarSign, User, LogOut, Settings } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { MobileDrawer } from "@/components/layout/MobileDrawer";
import { useAuthStore } from "@/stores/auth-store";
import { useWalletStore } from "@/stores/wallet-store";
import { useNotificationStore } from "@/stores/notification-store";

export function TopBar() {
  const router = useRouter();
  const { toggleMobileDrawer } = useUIStore();
  const { currentUser, logout } = useAuthStore();
  const { credits } = useWalletStore();
  const { unreadCount, prevUnreadCount, hasPrivateMessage, clearPrivateHighlight } = useNotificationStore();

  // Play notification sound when unreadCount increases
  const prevCountRef = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount > prevCountRef.current && prevCountRef.current >= 0) {
      try {
        const audio = new Audio("/sounds/notification.mp3");
        audio.volume = 0.5;
        audio.play().catch(() => {});
      } catch {}
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  const formattedCredits = credits.toLocaleString("en-US");

  const [query, setQuery] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  // Close avatar menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    }
    if (avatarMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [avatarMenuOpen]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed) {
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
        setSearchExpanded(false);
      }
    },
    [query, router]
  );

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-bg-surface px-4 md:h-16">
      {/* Mobile hamburger */}
      <button
        onClick={toggleMobileDrawer}
        className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-surface2 hover:text-text md:hidden"
        aria-label="Toggle menu"
      >
        <Menu size={22} />
      </button>

      {/* Mobile drawer */}
      <MobileDrawer />

      {/* Logo - visible on desktop */}
      <Link href="/home" className="hidden items-center gap-2 md:flex">
        <img src="/logo.png?v=3" alt="Rally Live" className="h-8 w-8 object-contain" />
      </Link>

      {/* Search bar - centered */}
      <div className="flex flex-1 items-center justify-center">
        {/* Desktop search - always visible, centered */}
        <form onSubmit={handleSearch} className="hidden w-full max-w-lg md:flex">
          <div className="relative w-full">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Rally Live..."
              className="w-full rounded-full border border-border bg-bg-surface2 py-2 pl-10 pr-4 text-sm text-text placeholder:text-text-muted transition-colors focus:border-primary focus:outline-none"
            />
          </div>
        </form>

        {/* Mobile search - expandable */}
        {searchExpanded ? (
          <form onSubmit={handleSearch} className="flex w-full items-center gap-2 md:hidden">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                autoFocus
                className="w-full rounded-full border border-border bg-bg-surface2 py-2 pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setSearchExpanded(false)}
              className="rounded-lg p-2 text-text-muted hover:text-text"
              aria-label="Close search"
            >
              <X size={20} />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setSearchExpanded(true)}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-surface2 hover:text-text md:hidden"
            aria-label="Open search"
          >
            <Search size={22} />
          </button>
        )}
      </div>

      {/* Right section */}
      {!searchExpanded && (
        <div className="flex items-center gap-2">
          {/* Credit balance pill */}
          <button
            onClick={() => router.push("/wallet")}
            className="flex items-center gap-1.5 rounded-full bg-bg-surface2 px-3 py-1.5 text-sm transition-colors hover:bg-bg-surface2/80"
            aria-label="View wallet"
          >
            <CircleDollarSign size={16} className="text-accent" />
            <span className="font-semibold text-text">{formattedCredits}</span>
          </button>

          {/* Notification bell */}
          <button
            onClick={() => {
              if (hasPrivateMessage) {
                clearPrivateHighlight();
              }
              router.push("/notifications");
            }}
            className={`relative rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-surface2 ${
              unreadCount > 0 && !hasPrivateMessage
                ? "animate-pulse ring-2 ring-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                : ""
            }`}
            style={
              hasPrivateMessage
                ? { backgroundColor: "rgba(34, 197, 94, 0.2)", color: "#22C55E" }
                : unreadCount > 0
                ? { color: "var(--color-text)" }
                : undefined
            }
            suppressHydrationWarning
            aria-label="Notifications"
          >
            <Bell
              size={20}
              style={hasPrivateMessage ? { color: "#22C55E" } : undefined}
            />
            {unreadCount > 0 && !hasPrivateMessage && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />
            )}
            {unreadCount > 0 && hasPrivateMessage && (
              <span
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full"
                style={{ backgroundColor: "#22C55E" }}
              />
            )}
          </button>

          {/* User avatar with dropdown */}
          {currentUser ? (
            <div className="relative" ref={avatarMenuRef}>
              <button
                onClick={() => setAvatarMenuOpen((v) => !v)}
                className="overflow-hidden rounded-full ring-2 ring-transparent transition-all hover:ring-primary"
              >
                <img
                  src={currentUser.avatarUrl ?? undefined}
                  alt={currentUser.displayName}
                  className="h-8 w-8 rounded-full object-cover"
                />
              </button>
              {avatarMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-border bg-bg-surface shadow-xl z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium text-text truncate">{currentUser.displayName}</p>
                    <p className="text-xs text-text-muted truncate">@{currentUser.username}</p>
                  </div>
                  <button
                    onClick={() => { setAvatarMenuOpen(false); router.push(`/profile/${currentUser.username}`); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-bg-surface2 transition-colors"
                  >
                    <User size={16} />
                    Profile
                  </button>
                  <button
                    onClick={() => { setAvatarMenuOpen(false); router.push("/settings"); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-bg-surface2 transition-colors"
                  >
                    <Settings size={16} />
                    Settings
                  </button>
                  <button
                    onClick={async () => { setAvatarMenuOpen(false); await logout(); router.push("/login"); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-bg-surface2 transition-colors border-t border-border"
                  >
                    <LogOut size={16} />
                    Log Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => router.push("/login")}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Sign In
            </button>
          )}
        </div>
      )}
    </header>
  );
}
