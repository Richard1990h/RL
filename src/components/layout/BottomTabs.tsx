"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Radio, PlusCircle, MessageCircle, User, LogIn, Search, Check } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useUploadStore } from "@/stores/upload-store";

interface TabItem {
  label: string;
  icon: typeof Home;
  href: string;
  isCenter?: boolean;
  badge?: boolean;
}

const publicTabs: TabItem[] = [
  { label: "Home", icon: Home, href: "/home" },
  { label: "Live", icon: Radio, href: "/live" },
  { label: "Search", icon: Search, href: "/search" },
  { label: "Sign In", icon: LogIn, href: "/login" },
];

const authTabs: TabItem[] = [
  { label: "Home", icon: Home, href: "/home" },
  { label: "Live", icon: Radio, href: "/live" },
  { label: "Upload", icon: PlusCircle, href: "/upload", isCenter: true },
  { label: "Messages", icon: MessageCircle, href: "/messages", badge: false },
  { label: "Profile", icon: User, href: "/profile/me" },
];

export function BottomTabs() {
  const pathname = usePathname();
  const { isLoggedIn, currentUser } = useAuthStore();
  const { isUploading, progress, uploadedUrl } = useUploadStore();
  const tabs = isLoggedIn ? authTabs.map((t) =>
    t.label === "Profile" && currentUser ? { ...t, href: `/profile/${currentUser.username}` } : t
  ) : publicTabs;

  const isActive = (href: string) => {
    if (href === "/home") return pathname === "/home" || pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  // SVG progress ring calc (radius 26, circumference ~163)
  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (progress / 100) * ringCircumference;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-bg-surface md:hidden">
      <div className="flex items-end justify-around px-2 pb-[env(safe-area-inset-bottom,8px)] pt-1">
        {tabs.map((tab) => {
          const active = isActive(tab.href);

          if (tab.isCenter) {
            const showRing = isUploading || (uploadedUrl && progress === 100);
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
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full shadow-lg"
                    style={{
                      background:
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
                  {isUploading
                    ? `${Math.round(progress)}%`
                    : uploadedUrl && progress === 100
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
                  className={active ? "text-primary" : "text-text-muted"}
                />
                {tab.badge && (
                  <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full border-2 border-bg-surface bg-danger" />
                )}
              </div>
              <span
                className={`text-[10px] font-medium ${
                  active ? "text-primary" : "text-text-muted"
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
