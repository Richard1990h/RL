"use client";

import { Gift } from "lucide-react";

interface DonateButtonProps {
  onClick: () => void;
}

export default function DonateButton({ onClick }: DonateButtonProps) {
  return (
    <button
      onClick={onClick}
      className="
        inline-flex items-center gap-2 px-5 py-2.5
        bg-gradient-to-r from-primary to-accent text-white
        font-semibold text-sm rounded-radius-xl
        hover:opacity-90 active:scale-[0.97]
        transition-all duration-200
        shadow-[var(--shadow-glow)]
      "
    >
      <Gift size={18} />
      Send Gift
    </button>
  );
}
