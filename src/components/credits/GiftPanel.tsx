"use client";

import { useState, useMemo } from "react";
import type { DonationTier } from "@/lib/types";
import Tabs from "@/components/ui/Tabs";

interface GiftPanelProps {
  tiers: DonationTier[];
  onSelect: (tier: DonationTier) => void;
}

export default function GiftPanel({ tiers, onSelect }: GiftPanelProps) {
  const categories = useMemo(() => {
    const cats = Array.from(new Set(tiers.map((t) => t.category)));
    return [{ id: "all", label: "All" }, ...cats.map((c) => ({ id: c, label: c }))];
  }, [tiers]);

  const [activeCategory, setActiveCategory] = useState("all");

  const filtered =
    activeCategory === "all"
      ? tiers
      : tiers.filter((t) => t.category === activeCategory);

  return (
    <div className="bg-bg-surface border border-border rounded-radius-lg overflow-hidden">
      {/* Category tabs */}
      <div className="px-4 pt-3">
        <Tabs
          tabs={categories}
          activeTab={activeCategory}
          onChange={setActiveCategory}
        />
      </div>

      {/* Gift grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-4">
        {filtered.map((tier) => (
          <button
            key={tier.id}
            onClick={() => onSelect(tier)}
            className="
              flex flex-col items-center gap-1.5 p-3
              bg-bg-surface2 rounded-radius-md border border-transparent
              hover:border-primary hover:bg-bg-surface3
              transition-all duration-200
              active:scale-95
            "
          >
            {/* Gift icon */}
            <span className="text-2xl">{tier.iconKey}</span>
            {/* Name */}
            <span className="text-xs font-medium text-text truncate w-full text-center">
              {tier.name}
            </span>
            {/* Price */}
            <span className="text-[10px] font-semibold text-accent">
              {tier.valueCents.toLocaleString()} {tier.valueCents === 1 ? "credit" : "credits"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
