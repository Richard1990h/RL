"use client";

import { ReactNode, ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gradient";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white shadow-[0_10px_24px_rgba(29,78,216,0.35)] hover:bg-primary-dark hover:shadow-[0_14px_30px_rgba(29,78,216,0.5)]",
  secondary: "border border-border bg-bg-surface2 text-text hover:border-border-light hover:bg-bg-surface3",
  ghost: "bg-transparent text-text-secondary hover:bg-bg-surface2 hover:text-text",
  danger: "border border-danger/30 bg-danger/16 text-danger hover:bg-danger/24",
  gradient:
    "bg-gradient-to-r from-primary via-primary-light to-accent text-white shadow-[0_12px_28px_rgba(14,165,233,0.35)] hover:brightness-110",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "rounded-lg px-3 py-1.5 text-sm gap-1.5",
  md: "rounded-xl px-4 py-2 text-base gap-2",
  lg: "rounded-xl px-6 py-3 text-lg gap-2.5",
};

export default function Button({
  variant = "primary",
  size = "md",
  children,
  icon,
  fullWidth = false,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center font-semibold
        transition-all duration-200 ease-out
        focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
        disabled:opacity-40 disabled:pointer-events-none
        active:scale-[0.98]
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? "w-full" : ""}
        ${className}
      `}
      disabled={disabled}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
