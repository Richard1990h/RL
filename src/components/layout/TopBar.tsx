"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Menu, Bell, CircleDollarSign, User, LogOut, Settings } from "lucide-react";
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
  const { unreadCount, hasPrivateMessage, clearPrivateHighlight } = useNotificationStore();

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

  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  // Close avatar menu on outside click
  useEffect(() => {
    function handleClickOutside(e: Event) {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    }
    if (avatarMenuOpen) {
      document.addEventListener("pointerdown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside, { passive: true });
      return () => {
        document.removeEventListener("pointerdown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }
  }, [avatarMenuOpen]);

  return (
    <header className="sticky top-0 z-[70] mx-2 mt-2 flex h-14 items-center gap-2 rounded-2xl border border-border/80 bg-bg-surface/85 px-2.5 shadow-[0_16px_40px_rgba(2,8,23,0.38)] backdrop-blur-xl lg:mx-6 lg:mt-3 lg:h-16 lg:gap-3 lg:px-4">
      {/* Mobile hamburger */}
      <button
        onClick={toggleMobileDrawer}
        className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-surface2 hover:text-text lg:hidden"
        aria-label="Toggle menu"
      >
        <Menu size={22} />
      </button>

      {/* Mobile drawer */}
      <MobileDrawer />

      {/* Logo - visible on desktop */}
      <Link href="/home" className="hidden items-center gap-2 lg:flex">
        <img src="/logo.png?v=3" alt="Rally Live" className="h-8 w-8 object-contain" />
        <span className="text-sm font-semibold tracking-wide text-text-secondary">Rally Live</span>
      </Link>

      <div className="flex-1" />

      {/* Right section */}
      <div className="flex items-center gap-2">
          {/* Credit balance pill */}
          <button
            onClick={() => router.push("/wallet")}
            className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-bg-surface2/80 px-3 py-1.5 text-sm transition-colors hover:bg-bg-surface3/70 sm:flex"
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
            className={`relative rounded-xl border border-transparent p-2 text-text-muted transition-colors hover:border-border hover:bg-bg-surface2 ${
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
                className="overflow-hidden rounded-full ring-2 ring-border/60 transition-all hover:ring-primary"
              >
                <img
                  src={currentUser.avatarUrl ?? undefined}
                  alt={currentUser.displayName}
                className="h-7 w-7 rounded-full object-cover lg:h-8 lg:w-8"
              />
              </button>
              {avatarMenuOpen && (
                <div className="absolute right-0 top-full z-[90] mt-2 w-52 overflow-hidden rounded-xl border border-border bg-bg-surface shadow-xl">
                  <div className="border-b border-border px-3 py-2">
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
    </header>
  );
}
