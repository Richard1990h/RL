"use client";

import { useState } from "react";
import { Check } from "lucide-react";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  online?: boolean;
  verified?: boolean;
}

const sizeMap: Record<string, { px: number; text: string; dot: string; badge: string }> = {
  sm: { px: 32, text: "text-xs", dot: "w-2.5 h-2.5", badge: "w-3.5 h-3.5" },
  md: { px: 40, text: "text-sm", dot: "w-3 h-3", badge: "w-4 h-4" },
  lg: { px: 56, text: "text-lg", dot: "w-3.5 h-3.5", badge: "w-5 h-5" },
  xl: { px: 80, text: "text-2xl", dot: "w-4 h-4", badge: "w-6 h-6" },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function Avatar({
  src,
  name,
  size = "md",
  online,
  verified,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const s = sizeMap[size];

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={`
          rounded-full overflow-hidden bg-bg-surface2
          flex items-center justify-center ${s.text} font-semibold text-text-secondary
          ${online ? "ring-2 ring-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : ""}
        `}
        style={{ width: s.px, height: s.px }}
      >
        {src && !imgError ? (
          <img
            src={src}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span>{getInitials(name)}</span>
        )}
      </div>

      {/* Online indicator */}
      {online && (
        <span
          className={`absolute bottom-0 right-0 ${s.dot} rounded-full bg-success border-2 border-bg-surface`}
        />
      )}

      {/* Verified badge */}
      {verified && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${s.badge} rounded-full bg-primary flex items-center justify-center`}
        >
          <Check size={s.px < 56 ? 10 : 14} className="text-white" />
        </span>
      )}
    </div>
  );
}
