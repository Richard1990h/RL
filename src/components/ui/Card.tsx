"use client";

import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
  padding?: "sm" | "md" | "lg";
}

const paddingStyles: Record<string, string> = {
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export default function Card({
  children,
  className = "",
  hoverable = false,
  padding = "md",
}: CardProps) {
  return (
    <div
      className={`
        rounded-2xl border border-border bg-bg-surface/90 shadow-[0_14px_34px_rgba(2,8,23,0.28)] backdrop-blur-sm
        ${paddingStyles[padding]}
        ${hoverable ? "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-border-light hover:shadow-[var(--shadow-glow)]" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
