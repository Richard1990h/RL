"use client";

import { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "live" | "new" | "premium" | "success" | "danger" | "secondary";
}

const variantStyles: Record<string, string> = {
  default: "border border-border bg-bg-surface2 text-text-secondary",
  live: "bg-danger text-white shadow-[0_6px_16px_rgba(239,68,68,0.45)] animate-pulse-live",
  new: "bg-gradient-to-r from-primary to-accent text-white",
  premium: "bg-warning/20 text-warning border border-warning/30",
  success: "bg-success/20 text-success border border-success/30",
  danger: "bg-danger/20 text-danger border border-danger/30",
  secondary: "border border-border bg-bg-surface2 text-text-muted",
};

export default function Badge({ children, variant = "default" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold
        leading-none tracking-wide uppercase
        ${variantStyles[variant]}
      `}
    >
      {children}
    </span>
  );
}
