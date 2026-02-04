"use client";

import { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "live" | "new" | "premium";
}

const variantStyles: Record<string, string> = {
  default: "bg-bg-surface2 text-text-secondary",
  live: "bg-danger text-white animate-pulse-live",
  new: "bg-gradient-to-r from-primary to-accent text-white",
  premium: "bg-warning/20 text-warning border border-warning/30",
};

export default function Badge({ children, variant = "default" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2 py-0.5 text-xs font-semibold
        rounded-full leading-none tracking-wide uppercase
        ${variantStyles[variant]}
      `}
    >
      {children}
    </span>
  );
}
