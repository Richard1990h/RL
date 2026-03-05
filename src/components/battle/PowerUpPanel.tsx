"use client";

import { useState, useCallback } from "react";
import { Zap, Cloud, Hammer, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { POWER_UPS, type PowerUpType, type ActivePowerUp, getPowerUpRemainingMs } from "@/lib/games/power-ups";
import Button from "@/components/ui/Button";

interface PowerUpPanelProps {
  userCredits: number;
  activePowerUps: ActivePowerUp[];
  onPurchase: (type: PowerUpType, targetId?: string) => Promise<void>;
  selectableTargets?: Array<{ userId: string; displayName: string }>;
  currentUserId?: string;
  disabled?: boolean;
  timeExtensionsUsed?: number;
  maxTimeExtensions?: number;
}

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Zap,
  Cloud,
  Hammer,
  Clock,
};

function formatDuration(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  return `${seconds}s`;
}

function formatCredits(credits: number): string {
  if (credits >= 1000) return `${(credits / 1000).toFixed(1)}K`;
  return credits.toLocaleString();
}

export default function PowerUpPanel({
  userCredits,
  activePowerUps,
  onPurchase,
  selectableTargets = [],
  currentUserId,
  disabled = false,
  timeExtensionsUsed = 0,
  maxTimeExtensions = 5,
}: PowerUpPanelProps) {
  const [loading, setLoading] = useState<PowerUpType | null>(null);
  const [selectingTargetFor, setSelectingTargetFor] = useState<PowerUpType | null>(null);

  const handlePurchase = useCallback(
    async (type: PowerUpType, targetId?: string) => {
      if (loading || disabled) return;

      const config = POWER_UPS.find((p) => p.type === type);
      if (!config) return;

      // If power-up needs target selection and no target provided
      if (config.targetType === "opponent" && !targetId) {
        setSelectingTargetFor(type);
        return;
      }

      setLoading(type);
      setSelectingTargetFor(null);
      try {
        await onPurchase(type, targetId);
      } finally {
        setLoading(null);
      }
    },
    [loading, disabled, onPurchase]
  );

  const handleTargetSelect = useCallback(
    (targetId: string) => {
      if (selectingTargetFor) {
        handlePurchase(selectingTargetFor, targetId);
      }
    },
    [selectingTargetFor, handlePurchase]
  );

  const cancelTargetSelect = useCallback(() => {
    setSelectingTargetFor(null);
  }, []);

  // Check if a power-up is currently active for the current user
  const isActiveForSelf = (type: PowerUpType): ActivePowerUp | undefined => {
    const now = Date.now();
    return activePowerUps.find(
      (p) =>
        p.type === type &&
        p.targetId === currentUserId &&
        (p.expiresAt === null || p.expiresAt > now)
    );
  };

  // Target selection UI
  if (selectingTargetFor) {
    const config = POWER_UPS.find((p) => p.type === selectingTargetFor);
    const opponents = selectableTargets.filter((t) => t.userId !== currentUserId);

    return (
      <div className="p-3 bg-bg-surface rounded-xl border border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text">
            Target for {config?.name}
          </h3>
          <button
            onClick={cancelTargetSelect}
            className="text-xs text-text-muted hover:text-text"
          >
            Cancel
          </button>
        </div>
        <div className="space-y-2">
          {opponents.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">
              No targets available
            </p>
          ) : (
            opponents.map((target) => (
              <button
                key={target.userId}
                onClick={() => handleTargetSelect(target.userId)}
                disabled={loading === selectingTargetFor}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg",
                  "border border-border bg-bg-surface2 hover:bg-bg-surface3",
                  "transition-colors text-left",
                  loading === selectingTargetFor && "opacity-50 cursor-not-allowed"
                )}
              >
                <span className="text-sm font-medium text-text">
                  {target.displayName}
                </span>
                {loading === selectingTargetFor && (
                  <Loader2 size={14} className="animate-spin text-text-muted" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          <Zap size={14} className="text-warning" />
          Power-Ups
        </h3>
        <span className="text-xs text-text-muted">
          {formatCredits(userCredits)} credits
        </span>
      </div>

      {/* Power-up grid */}
      <div className="grid grid-cols-2 gap-2">
        {POWER_UPS.map((powerUp) => {
          const IconComponent = ICON_MAP[powerUp.icon] || Zap;
          const canAfford = userCredits >= powerUp.cost;
          const isLoading = loading === powerUp.type;
          const activeSelf = isActiveForSelf(powerUp.type);
          const remainingMs = activeSelf ? getPowerUpRemainingMs(activeSelf) : 0;

          // Check TIME_MAKER limit
          const isTimeMakerExhausted =
            powerUp.type === "TIME_MAKER" && timeExtensionsUsed >= maxTimeExtensions;

          const isDisabled = disabled || !canAfford || isLoading || isTimeMakerExhausted;

          return (
            <button
              key={powerUp.type}
              onClick={() => handlePurchase(powerUp.type)}
              disabled={isDisabled}
              className={cn(
                "relative flex flex-col items-center gap-1.5 p-3 rounded-xl",
                "border transition-all duration-200",
                canAfford && !disabled && !isTimeMakerExhausted
                  ? "border-border bg-bg-surface hover:bg-bg-surface2 hover:border-border-light cursor-pointer"
                  : "border-border/50 bg-bg-surface/50 opacity-60 cursor-not-allowed",
                activeSelf && "ring-2 ring-offset-2 ring-offset-bg",
                isLoading && "animate-pulse"
              )}
              style={{
                ["--tw-ring-color" as string]: activeSelf ? powerUp.color : undefined,
              }}
            >
              {/* Active indicator */}
              {activeSelf && remainingMs > 0 && (
                <div
                  className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white animate-power-up-glow"
                  style={{ backgroundColor: powerUp.color }}
                >
                  {formatDuration(remainingMs)}
                </div>
              )}

              {/* Icon */}
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  isLoading ? "animate-spin" : "animate-power-up-activate"
                )}
                style={{ backgroundColor: `${powerUp.color}20` }}
              >
                <span style={{ color: powerUp.color }}>
                  {isLoading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <IconComponent size={20} />
                  )}
                </span>
              </div>

              {/* Name */}
              <span className="text-xs font-semibold text-text">
                {powerUp.name}
              </span>

              {/* Cost */}
              <span
                className={cn(
                  "text-[10px] font-bold",
                  canAfford ? "text-success" : "text-danger"
                )}
              >
                {formatCredits(powerUp.cost)}
              </span>

              {/* TIME_MAKER usage indicator */}
              {powerUp.type === "TIME_MAKER" && (
                <span className="text-[9px] text-text-muted">
                  {timeExtensionsUsed}/{maxTimeExtensions} used
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Power-up descriptions */}
      <div className="space-y-1.5 px-1">
        {POWER_UPS.map((powerUp) => {
          const IconComponent = ICON_MAP[powerUp.icon] || Zap;
          return (
            <div key={powerUp.type} className="flex items-start gap-2">
              <span style={{ color: powerUp.color }} className="shrink-0 mt-0.5">
                <IconComponent size={12} />
              </span>
              <div>
                <span className="text-[10px] font-semibold text-text">
                  {powerUp.name}:
                </span>{" "}
                <span className="text-[10px] text-text-muted">
                  {powerUp.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active power-ups list */}
      {activePowerUps.length > 0 && (
        <div className="pt-2 border-t border-border">
          <h4 className="text-xs font-semibold text-text-secondary mb-2">
            Active Power-Ups
          </h4>
          <div className="space-y-1">
            {activePowerUps
              .filter((p) => p.expiresAt === null || p.expiresAt > Date.now())
              .map((powerUp) => {
                const config = POWER_UPS.find((c) => c.type === powerUp.type);
                const remaining = getPowerUpRemainingMs(powerUp);
                const IconComponent = config ? ICON_MAP[config.icon] || Zap : Zap;

                return (
                  <div
                    key={powerUp.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-bg-surface2"
                  >
                    <div className="flex items-center gap-2">
                      <IconComponent
                        size={12}
                        style={{ color: config?.color }}
                      />
                      <span className="text-xs text-text">
                        {config?.name || powerUp.type}
                      </span>
                    </div>
                    {remaining > 0 && (
                      <span
                        className="text-xs font-mono font-semibold"
                        style={{ color: config?.color }}
                      >
                        {formatDuration(remaining)}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
