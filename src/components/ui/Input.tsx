"use client";

import { InputHTMLAttributes, ReactNode } from "react";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  icon?: ReactNode;
}

export default function Input({
  label,
  icon,
  className = "",
  id,
  ...rest
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-text-secondary"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={`
            w-full bg-bg-surface2 text-text placeholder:text-text-muted
            border border-border rounded-radius-md
            px-3 py-2.5 text-sm
            transition-colors duration-200
            hover:border-border-light
            focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30
            disabled:opacity-40 disabled:pointer-events-none
            ${icon ? "pl-10" : ""}
            ${className}
          `}
          {...rest}
        />
      </div>
    </div>
  );
}
