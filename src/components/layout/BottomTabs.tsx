"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, MessageCircle, User, LogIn, Check, Crown, WifiOff, Shield } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useUploadStore } from "@/stores/upload-store";
import { subscribeNetwork } from "@/lib/offline/connectivity";

interface TabItem {
  label: string;
  icon: typeof Home;
  href: string;
  isCenter?: boolean;
  badge?: boolean;
}

const publicTabs: TabItem[] = [
  { label: "Home", icon: Home, href: "/home" },
  { label: "Sign In", icon: LogIn, href: "/login" },
];

const authTabs: TabItem[] = [
  { label: "Home", icon: Home, href: "/home" },
  { label: "FiveM", icon: Shield, href: "/fivem" },
  { label: "Upload", icon: PlusCircle, href: "/upload-stream" },
  { label: "Messages", icon: MessageCircle, href: "/messages", badge: false },
  { label: "Profile", icon: User, href: "/profile/me" },
];

export function BottomTabs() {
  const pathname = usePathname();
  const { isLoggedIn, currentUser } = useAuthStore();
  const { isUploading, progress, uploadedUrl } = useUploadStore();
  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== "undefined" ? !navigator.onLine : false));
  const typedUser = currentUser as (typeof currentUser & { isOwner?: boolean; role?: string }) | null;
  const isAdmin = !!typedUser?.isOwner || typedUser?.role === "OWNER";
  const adminCenterTab: TabItem = isOffline
    ? { label: "Offline", icon: WifiOff, href: "/offline", isCenter: true }
    : { label: "Admin", icon: Crown, href: "/admin", isCenter: true };
  const resolvedAuthTabsAdmin: TabItem[] = [
    { label: "Home", icon: Home, href: "/home" },
    { label: "FiveM", icon: Shield, href: "/fivem" },
    { label: "Upload", icon: PlusCircle, href: "/upload-stream" },
    adminCenterTab,
    { label: "Messages", icon: MessageCircle, href: "/messages", badge: false },
    { label: "Profile", icon: User, href: "/profile/me" },
  ];
  const loggedInTabs = isAdmin ? resolvedAuthTabsAdmin : authTabs;
  const tabs = isLoggedIn ? loggedInTabs.map((t) =>
    t.label === "Profile" && currentUser ? { ...t, href: `/profile/${currentUser.username}` } : t
  ) : publicTabs;

  useEffect(() => {
    const stop = subscribeNetwork((state) => {
      setIsOffline(state === "offline");
    });
    return stop;
  }, []);

  if (pathname.startsWith("/admin")) {
    return null;
  }

  const isActive = (href: string) => {
    if (href === "/home") return pathname === "/home" || pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  // SVG progress ring calc (radius 26, circumference ~163)
  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (progress / 100) * ringCircumference;

  return (
    <nav className="fixed bottom-2 left-2 right-2 z-50 rounded-2xl border border-border/80 bg-bg-surface/90 shadow-[0_18px_42px_rgba(2,8,23,0.45)] backdrop-blur-xl lg:hidden">
      <div className="flex items-end justify-around px-2 pb-[env(safe-area-inset-bottom,8px)] pt-1.5">
        {tabs.map((tab) => {
          const active = isActive(tab.href);

          if (tab.isCenter) {
            const showRing = tab.label === "Upload" && (isUploading || (uploadedUrl && progress === 100));
            const isOfflineCenter = tab.label === "Offline";
            return (
              <Link
                key={tab.label}
                href={tab.href}
                className="relative -top-3 flex flex-col items-center"
              >
                <div className="relative">
                  {/* Progress ring behind the button */}
                  {showRing && (
                    <svg
                      className="absolute -inset-1 w-[56px] h-[56px]"
                      viewBox="0 0 56 56"
                    >
                      {/* Background ring */}
                      <circle
                        cx="28" cy="28" r={ringRadius}
                        fill="none"
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth="3"
                      />
                      {/* Progress ring */}
                      <circle
                        cx="28" cy="28" r={ringRadius}
                        fill="none"
                        stroke={progress === 100 ? "var(--color-success)" : "white"}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={ringCircumference}
                        strokeDashoffset={ringOffset}
                        transform="rotate(-90 28 28)"
                        className="transition-all duration-500 ease-out"
                      />
                    </svg>
                  )}
                  {isOfflineCenter && (
                    <span className="absolute -inset-1 rounded-full ring-4 ring-red-500/60 animate-pulse" />
                  )}
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/25 shadow-lg"
                    style={{
                      background: isOfflineCenter
                        ? "linear-gradient(135deg, #ef4444, #b91c1c)"
                        :
                        "linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-end))",
                    }}
                  >
                    {uploadedUrl && progress === 100 ? (
                      <Check size={24} className="text-white" />
                    ) : (
                      <tab.icon size={24} className="text-white" />
                    )}
                  </div>
                </div>
                <span className="mt-0.5 text-[10px] font-medium text-text-secondary">
                  {tab.label === "Upload" && isUploading
                    ? `${Math.round(progress)}%`
                    : tab.label === "Upload" && uploadedUrl && progress === 100
                      ? "Ready"
                      : tab.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={tab.label}
              href={tab.href}
              className="relative flex flex-col items-center gap-0.5 py-2"
            >
              <div className="relative">
                <tab.icon
                  size={22}
                  className={active ? "text-primary-light" : "text-text-muted"}
                />
                {tab.badge && (
                  <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full border-2 border-bg-surface bg-danger" />
                )}
              </div>
              <span
                className={`text-[10px] font-medium ${
                  active ? "text-primary-light" : "text-text-muted"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
