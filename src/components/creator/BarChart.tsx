"use client";

interface BarChartProps {
  data: number[];
  labels?: string[];
  height?: number;
  color?: string;
}

export default function BarChart({
  data,
  labels,
  height = 200,
  color,
}: BarChartProps) {
  const max = Math.max(...data, 1);

  return (
    <div
      className="bg-bg-surface border border-border rounded-radius-lg p-4"
      style={{ height }}
    >
      <div className="flex items-end gap-1.5 h-full">
        {data.map((value, i) => {
          const pct = (value / max) * 100;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end h-full gap-1"
            >
              {/* Bar */}
              <div
                className="w-full rounded-t-sm transition-all duration-300"
                style={{
                  height: `${pct}%`,
                  minHeight: 2,
                  background:
                    color ||
                    `linear-gradient(to top, var(--color-primary), var(--color-accent))`,
                  opacity: 0.85,
                }}
              />
              {/* Label */}
              {labels && labels[i] && (
                <span className="text-[10px] text-text-muted truncate w-full text-center">
                  {labels[i]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
