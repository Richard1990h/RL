"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DonationAlertData {
  id: string;
  from: string;
  avatar: string;
  tierName: string;
  tierIcon: string;
  amount: number;
  rarityColor: string;
  animationType: "sparkle" | "explosion" | "none";
  category: "basic" | "premium";
}

interface DonationAlertProps {
  alert: DonationAlertData | null;
  onComplete: () => void;
}

// ─── Tier icon SVGs (inline for AAA quality, no external deps) ───────────────

function SparkleIcon({ color, size = 48 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <g filter="url(#sparkle-glow)">
        <path d="M24 2L28 18L44 24L28 30L24 46L20 30L4 24L20 18L24 2Z" fill={color} />
        <path d="M24 2L28 18L44 24L28 30L24 46L20 30L4 24L20 18L24 2Z" fill="url(#sparkle-grad)" fillOpacity="0.5" />
      </g>
      <defs>
        <filter id="sparkle-glow" x="-4" y="-4" width="56" height="56" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="3" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="sparkle-grad" x1="4" y1="2" x2="44" y2="46">
          <stop stopColor="white" /><stop offset="1" stopColor="transparent" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function FireIcon({ color, size = 56 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <g filter="url(#fire-glow)">
        <path d="M28 4C28 4 36 16 36 24C36 28 34 32 28 36C22 32 20 28 20 24C20 16 28 4 28 4Z" fill={color} />
        <path d="M28 12C28 12 32 20 32 26C32 29 30 32 28 34C26 32 24 29 24 26C24 20 28 12 28 12Z" fill="#FDE68A" fillOpacity="0.8" />
        <path d="M28 20C28 20 30 24 30 28C30 30 29 32 28 33C27 32 26 30 26 28C26 24 28 20 28 20Z" fill="white" fillOpacity="0.6" />
        <ellipse cx="28" cy="42" rx="12" ry="4" fill={color} fillOpacity="0.3" />
      </g>
      <defs>
        <filter id="fire-glow" x="0" y="0" width="56" height="56" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="4" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
    </svg>
  );
}

function BombIcon({ color, size = 64 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <g filter="url(#bomb-glow)">
        <circle cx="30" cy="36" r="16" fill={color} />
        <circle cx="30" cy="36" r="16" fill="url(#bomb-shine)" fillOpacity="0.4" />
        <ellipse cx="24" cy="30" rx="4" ry="6" fill="white" fillOpacity="0.2" />
        <path d="M38 20L42 8" stroke="#888" strokeWidth="3" strokeLinecap="round" />
        <circle cx="44" cy="6" r="4" fill="#FDE68A" />
        <circle cx="44" cy="6" r="4" fill={color} fillOpacity="0.5" />
        <path d="M44 2L46 0M48 6L50 4M44 10L46 12M40 6L38 4" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <defs>
        <filter id="bomb-glow" x="0" y="0" width="64" height="64" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="4" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="bomb-shine" cx="0.35" cy="0.35" r="0.7">
          <stop stopColor="white" /><stop offset="1" stopColor="transparent" />
        </radialGradient>
      </defs>
    </svg>
  );
}

function CrownIcon({ color, size = 72 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <g filter="url(#crown-glow)">
        <path d="M12 52H60L56 28L44 38L36 18L28 38L16 28L12 52Z" fill={color} />
        <path d="M12 52H60L56 28L44 38L36 18L28 38L16 28L12 52Z" fill="url(#crown-grad)" fillOpacity="0.5" />
        <rect x="10" y="52" width="52" height="6" rx="2" fill={color} />
        <rect x="10" y="52" width="52" height="6" rx="2" fill="white" fillOpacity="0.2" />
        <circle cx="36" cy="28" r="3" fill="white" fillOpacity="0.7" />
        <circle cx="20" cy="36" r="2.5" fill="white" fillOpacity="0.5" />
        <circle cx="52" cy="36" r="2.5" fill="white" fillOpacity="0.5" />
        <circle cx="16" cy="28" r="3" fill={color} stroke="white" strokeOpacity="0.3" strokeWidth="1" />
        <circle cx="56" cy="28" r="3" fill={color} stroke="white" strokeOpacity="0.3" strokeWidth="1" />
        <circle cx="36" cy="18" r="3" fill={color} stroke="white" strokeOpacity="0.3" strokeWidth="1" />
      </g>
      <defs>
        <filter id="crown-glow" x="0" y="0" width="72" height="72" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="5" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="crown-grad" x1="12" y1="18" x2="60" y2="58">
          <stop stopColor="white" /><stop offset="1" stopColor="transparent" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function getTierIcon(iconKey: string, color: string) {
  switch (iconKey) {
    case "sparkle": return <SparkleIcon color={color} />;
    case "fire": return <FireIcon color={color} />;
    case "bomb": return <BombIcon color={color} />;
    case "crown": return <CrownIcon color={color} />;
    default: return <SparkleIcon color={color} />;
  }
}

// ─── Particle system ─────────────────────────────────────────────────────────

function SparkleParticles({ color, count = 20 }: { color: string; count?: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const angle = (360 / count) * i;
        const distance = 60 + Math.random() * 100;
        const size = 3 + Math.random() * 5;
        const delay = Math.random() * 0.3;
        const duration = 0.8 + Math.random() * 0.6;
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: size,
              height: size,
              backgroundColor: i % 3 === 0 ? color : i % 3 === 1 ? "white" : "#FDE68A",
              boxShadow: `0 0 ${size * 2}px ${color}`,
              animation: `donation-particle ${duration}s ease-out ${delay}s forwards`,
              transform: `translate(-50%, -50%)`,
              ["--tx" as string]: `${Math.cos(angle * Math.PI / 180) * distance}px`,
              ["--ty" as string]: `${Math.sin(angle * Math.PI / 180) * distance}px`,
              opacity: 0,
            }}
          />
        );
      })}
    </div>
  );
}

function ExplosionParticles({ color, count = 40 }: { color: string; count?: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const angle = (360 / count) * i + Math.random() * 20;
        const distance = 80 + Math.random() * 160;
        const size = 4 + Math.random() * 8;
        const delay = Math.random() * 0.15;
        const duration = 0.6 + Math.random() * 0.8;
        const isRing = i < count / 3;
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2"
            style={{
              width: isRing ? size * 1.5 : size,
              height: isRing ? size * 1.5 : size,
              backgroundColor: isRing ? "transparent" : (i % 4 === 0 ? color : i % 4 === 1 ? "white" : i % 4 === 2 ? "#FDE68A" : "#F87171"),
              border: isRing ? `2px solid ${color}` : "none",
              borderRadius: isRing ? "50%" : i % 2 === 0 ? "50%" : "2px",
              boxShadow: `0 0 ${size * 3}px ${color}`,
              animation: `donation-particle ${duration}s ease-out ${delay}s forwards`,
              transform: `translate(-50%, -50%) rotate(${angle}deg)`,
              ["--tx" as string]: `${Math.cos(angle * Math.PI / 180) * distance}px`,
              ["--ty" as string]: `${Math.sin(angle * Math.PI / 180) * distance}px`,
              opacity: 0,
            }}
          />
        );
      })}
      {/* Shockwave ring */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
        style={{
          borderColor: color,
          animation: "donation-shockwave 0.8s ease-out forwards",
          width: 0,
          height: 0,
          opacity: 0,
        }}
      />
    </div>
  );
}

// ─── Sound generator ─────────────────────────────────────────────────────────

function playDonationSound(tier: string) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;

    if (tier === "sparkle") {
      // Light, sparkly ascending chime
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0, now + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.3);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.3);
      });
    } else if (tier === "fire") {
      // Warm, rising flame whoosh
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.6);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.exponentialRampToValueAtTime(2000, now + 0.3);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.start(now);
      osc.stop(now + 0.7);
      // Add crackle
      [0.1, 0.2, 0.35].forEach((t) => {
        const noise = ctx.createOscillator();
        const ng = ctx.createGain();
        noise.connect(ng);
        ng.connect(ctx.destination);
        noise.frequency.value = 2000 + Math.random() * 3000;
        noise.type = "square";
        ng.gain.setValueAtTime(0, now + t);
        ng.gain.linearRampToValueAtTime(0.06, now + t + 0.01);
        ng.gain.exponentialRampToValueAtTime(0.001, now + t + 0.08);
        noise.start(now + t);
        noise.stop(now + t + 0.08);
      });
    } else if (tier === "bomb") {
      // Deep boom with rumble
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.start(now);
      osc.stop(now + 0.8);
      // Shatter overtones
      [300, 500, 700, 1200].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = freq;
        o.type = "triangle";
        g.gain.setValueAtTime(0.08, now + 0.02 * i);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15 + 0.05 * i);
        o.start(now + 0.02 * i);
        o.stop(now + 0.2 + 0.05 * i);
      });
    } else if (tier === "crown") {
      // Royal fanfare
      const fanfare = [523, 659, 784, 1047, 784, 1047, 1319];
      fanfare.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = i < 4 ? "triangle" : "sine";
        const t = now + i * 0.1;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.03);
        gain.gain.setValueAtTime(0.18, t + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.35);
      });
      // Shimmer
      const shimmer = ctx.createOscillator();
      const sg = ctx.createGain();
      shimmer.connect(sg);
      sg.connect(ctx.destination);
      shimmer.frequency.value = 3000;
      shimmer.type = "sine";
      sg.gain.setValueAtTime(0, now + 0.5);
      sg.gain.linearRampToValueAtTime(0.06, now + 0.55);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      shimmer.start(now + 0.5);
      shimmer.stop(now + 1.2);
    }

    setTimeout(() => ctx.close(), 2000);
  } catch {
    // Audio not supported
  }
}

// ─── Main Alert Component ────────────────────────────────────────────────────

export default function DonationAlert({ alert, onComplete }: DonationAlertProps) {
  const [phase, setPhase] = useState<"enter" | "show" | "exit" | "idle">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!alert) {
      setPhase("idle");
      return;
    }

    // Play sound
    playDonationSound(alert.tierIcon);

    // Enter
    setPhase("enter");
    timerRef.current = setTimeout(() => {
      setPhase("show");
      timerRef.current = setTimeout(() => {
        setPhase("exit");
        timerRef.current = setTimeout(() => {
          setPhase("idle");
          onComplete();
        }, 600);
      }, alert.category === "premium" ? 4000 : 2500);
    }, 100);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [alert, onComplete]);

  if (!alert || phase === "idle") return null;

  const isPremium = alert.category === "premium";

  return (
    <>
      {/* CSS Animations injected inline */}
      <style>{`
        @keyframes donation-particle {
          0% { opacity: 1; transform: translate(-50%, -50%) translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) translate(var(--tx), var(--ty)) scale(0.2); }
        }
        @keyframes donation-shockwave {
          0% { width: 0; height: 0; opacity: 0.8; }
          100% { width: 300px; height: 300px; opacity: 0; margin-left: -150px; margin-top: -150px; }
        }
        @keyframes donation-glow-pulse {
          0%, 100% { box-shadow: inset 0 0 30px var(--glow-color), 0 0 20px var(--glow-color); }
          50% { box-shadow: inset 0 0 60px var(--glow-color), 0 0 40px var(--glow-color); }
        }
        @keyframes donation-icon-bounce {
          0% { transform: scale(0) rotate(-180deg); }
          50% { transform: scale(1.3) rotate(10deg); }
          70% { transform: scale(0.9) rotate(-5deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes donation-text-slide {
          0% { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes donation-amount-pop {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes donation-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* Full-screen overlay */}
      <div
        className={cn(
          "absolute inset-0 z-50 pointer-events-none flex items-center justify-center transition-opacity duration-500",
          phase === "enter" && "opacity-0",
          phase === "show" && "opacity-100",
          phase === "exit" && "opacity-0",
        )}
      >
        {/* Border glow */}
        <div
          className="absolute inset-0 rounded-xl transition-all duration-300"
          style={{
            ["--glow-color" as string]: alert.rarityColor + "60",
            boxShadow: phase === "show"
              ? `inset 0 0 40px ${alert.rarityColor}40, 0 0 30px ${alert.rarityColor}30`
              : "none",
            border: phase === "show" ? `3px solid ${alert.rarityColor}80` : "3px solid transparent",
            animation: phase === "show" ? "donation-glow-pulse 1.5s ease-in-out infinite" : "none",
          }}
        />

        {/* Particles */}
        {phase === "show" && (
          alert.animationType === "explosion"
            ? <ExplosionParticles color={alert.rarityColor} count={50} />
            : <SparkleParticles color={alert.rarityColor} count={25} />
        )}

        {/* Center alert card */}
        <div
          className={cn(
            "relative flex flex-col items-center z-10 transition-all duration-500",
            phase === "enter" && "scale-50 opacity-0",
            phase === "show" && "scale-100 opacity-100",
            phase === "exit" && "scale-75 opacity-0 -translate-y-8",
          )}
        >
          {/* Icon */}
          <div
            className="mb-3"
            style={{
              animation: phase === "show" ? "donation-icon-bounce 0.6s ease-out forwards" : "none",
              filter: `drop-shadow(0 0 20px ${alert.rarityColor})`,
            }}
          >
            {getTierIcon(alert.tierIcon, alert.rarityColor)}
          </div>

          {/* Card */}
          <div
            className="relative px-8 py-4 rounded-2xl border overflow-hidden"
            style={{
              backgroundColor: "rgba(0,0,0,0.85)",
              borderColor: alert.rarityColor + "80",
              boxShadow: `0 0 40px ${alert.rarityColor}30, inset 0 1px 0 rgba(255,255,255,0.1)`,
            }}
          >
            {/* Shimmer effect */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(90deg, transparent, ${alert.rarityColor}15, transparent)`,
                backgroundSize: "200% 100%",
                animation: "donation-shimmer 2s linear infinite",
              }}
            />

            {/* Sender name */}
            <div
              className="relative text-center"
              style={{ animation: phase === "show" ? "donation-text-slide 0.4s ease-out 0.2s both" : "none" }}
            >
              <div className="flex items-center justify-center gap-2 mb-1">
                {alert.avatar && (
                  <img src={alert.avatar} alt="" className="w-7 h-7 rounded-full border-2" style={{ borderColor: alert.rarityColor }} />
                )}
                <span className="text-white text-sm font-bold">{alert.from}</span>
              </div>
              <p className="text-white/70 text-xs">sent a</p>
            </div>

            {/* Tier name */}
            <div
              className="relative text-center mt-1"
              style={{ animation: phase === "show" ? "donation-amount-pop 0.5s ease-out 0.35s both" : "none" }}
            >
              <span
                className={cn(
                  "font-black tracking-wide",
                  isPremium ? "text-3xl" : "text-2xl",
                )}
                style={{
                  color: alert.rarityColor,
                  textShadow: `0 0 20px ${alert.rarityColor}, 0 0 40px ${alert.rarityColor}60`,
                }}
              >
                {alert.tierName}
              </span>
            </div>

            {/* Credit amount */}
            <div
              className="relative text-center mt-2"
              style={{ animation: phase === "show" ? "donation-text-slide 0.4s ease-out 0.5s both" : "none" }}
            >
              <span className="text-sm font-semibold" style={{ color: alert.rarityColor }}>
                {alert.amount.toLocaleString()} credits
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Queue manager hook ──────────────────────────────────────────────────────

export function useDonationAlertQueue() {
  const [queue, setQueue] = useState<DonationAlertData[]>([]);
  const [current, setCurrent] = useState<DonationAlertData | null>(null);

  const enqueue = useCallback((alert: DonationAlertData) => {
    setQueue((prev) => [...prev, alert]);
  }, []);

  const handleComplete = useCallback(() => {
    setCurrent(null);
  }, []);

  // Process queue
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
  }, [current, queue]);

  return { current, enqueue, handleComplete };
}
