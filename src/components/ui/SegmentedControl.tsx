"use client";

import { useRef, useState, useEffect } from "react";

interface Option {
  id: string;
  label: string;
}

interface SegmentedControlProps {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
}

export default function SegmentedControl({
  options,
  value,
  onChange,
}: SegmentedControlProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const activeIndex = options.findIndex((o) => o.id === value);
    if (activeIndex === -1) return;
    const buttons = containerRef.current.querySelectorAll<HTMLButtonElement>(
      "[data-segment]"
    );
    const btn = buttons[activeIndex];
    if (btn) {
      setIndicatorStyle({
        left: btn.offsetLeft,
        width: btn.offsetWidth,
      });
    }
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex bg-bg-surface2 rounded-radius-lg p-1"
    >
      {/* Sliding highlight */}
      <div
        className="absolute top-1 h-[calc(100%-8px)] bg-gradient-to-r from-primary to-accent rounded-radius-sm transition-all duration-200 ease-out"
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
      />

      {options.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            data-segment
            onClick={() => onChange(option.id)}
            className={`
              relative z-10 px-4 py-1.5 text-sm font-medium rounded-radius-sm transition-colors
              ${isActive ? "text-white" : "text-text-muted hover:text-text-secondary"}
            `}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
