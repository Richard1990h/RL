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
        bg-bg-surface border border-border rounded-radius-lg
        ${paddingStyles[padding]}
        ${hoverable ? "transition-all duration-200 hover:border-border-light hover:shadow-[var(--shadow-glow)] cursor-pointer" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
