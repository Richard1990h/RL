"use client";

import { ReactNode } from "react";
import { TrendingUp, TrendingDown, Info } from "lucide-react";
import Card from "@/components/ui/Card";

interface AnalyticsCardProps {
  title: string;
  value: string;
  trend: number;
  icon?: ReactNode;
  tooltip?: string;
}

export default function AnalyticsCard({
  title,
  value,
  trend,
  icon,
  tooltip,
}: AnalyticsCardProps) {
  const isPositive = trend >= 0;

  return (
    <Card padding="lg">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-text-muted flex items-center gap-1.5">
            {title}
            {tooltip && (
              <span className="cursor-help" title={tooltip}>
                <Info size={13} className="text-text-muted/60" />
              </span>
            )}
          </p>
          <p className="text-2xl font-bold text-text mt-1">{value}</p>

          {/* Trend */}
          <div
            className={`flex items-center gap-1 mt-2 text-sm font-medium ${
              isPositive ? "text-success" : "text-danger"
            }`}
          >
            {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <span>
              {isPositive ? "+" : ""}
              {trend.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Icon */}
        {icon && (
          <div className="p-3 bg-primary/10 rounded-radius-md text-primary shrink-0">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
