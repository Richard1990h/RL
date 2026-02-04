"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Check, AlertCircle, Info, Bug, Loader2 } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";

const typeConfig: Record<string, { bg: string; border: string; icon: React.ReactNode }> = {
  info: {
    bg: "bg-accent/10",
    border: "border-accent/30",
    icon: <Info size={18} className="text-accent" />,
  },
  success: {
    bg: "bg-success/10",
    border: "border-success/30",
    icon: <Check size={18} className="text-success" />,
  },
  error: {
    bg: "bg-danger/10",
    border: "border-danger/30",
    icon: <AlertCircle size={18} className="text-danger" />,
  },
};

function ToastItem({
  id,
  message,
  type,
}: {
  id: string;
  message: string;
  type: "info" | "success" | "error";
}) {
  const removeToast = useUIStore((s) => s.removeToast);
  const { currentUser } = useAuthStore();
  const config = typeConfig[type];
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    // Don't auto-dismiss if user is interacting with report prompt
    if (showConfirm || sending || sent) return;
    const timer = setTimeout(() => removeToast(id), type === "error" ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [id, removeToast, type, showConfirm, sending, sent]);

  const handleSendReport = useCallback(async () => {
    if (!currentUser) return;
    setSending(true);
    try {
      const page = typeof window !== "undefined" ? window.location.pathname : "";
      await fetch("/api/bugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: `Error: ${message.slice(0, 180)}`,
          description: `User encountered an error on ${page}:\n\n${message}\n\nTimestamp: ${new Date().toISOString()}\nUser-Agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`,
          page,
        }),
      });
      setSent(true);
      setTimeout(() => removeToast(id), 2000);
    } catch {
      setSending(false);
    }
  }, [currentUser, message, id, removeToast]);

  const handleClick = useCallback(() => {
    if (type !== "error" || showConfirm || sent) return;
    if (!currentUser) return;
    setShowConfirm(true);
  }, [type, showConfirm, sent, currentUser]);

  return (
    <div
      onClick={handleClick}
      className={`
        flex flex-col gap-2 px-4 py-3 rounded-radius-md border
        ${config.bg} ${config.border}
        shadow-[var(--shadow-medium)]
        animate-[slideIn_250ms_ease-out]
        ${type === "error" && currentUser && !showConfirm && !sent ? "cursor-pointer hover:brightness-110 transition-all" : ""}
      `}
    >
      <div className="flex items-center gap-3">
        <span className="shrink-0">{config.icon}</span>
        <p className="text-sm text-text flex-1">{message}</p>
        <button
          onClick={(e) => { e.stopPropagation(); removeToast(id); }}
          className="shrink-0 p-0.5 text-text-muted hover:text-text transition-colors"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tap to report hint for error toasts */}
      {type === "error" && currentUser && !showConfirm && !sent && (
        <p className="text-[10px] text-text-muted pl-[30px]">Tap to send bug report</p>
      )}

      {/* Confirm send report */}
      {showConfirm && !sent && (
        <div className="flex items-center gap-2 pl-[30px]">
          <p className="text-xs text-text-secondary flex-1">Send this as a bug report?</p>
          <button
            onClick={(e) => { e.stopPropagation(); handleSendReport(); }}
            disabled={sending}
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {sending ? <Loader2 size={12} className="animate-spin" /> : <Bug size={12} />}
            {sending ? "Sending..." : "Yes, send"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowConfirm(false); }}
            className="px-3 py-1 text-xs font-medium bg-bg-surface2 text-text-secondary rounded-lg hover:bg-bg-surface3 transition-colors"
          >
            No
          </button>
        </div>
      )}

      {/* Sent confirmation */}
      {sent && (
        <div className="flex items-center gap-2 pl-[30px]">
          <Check size={14} className="text-success" />
          <p className="text-xs text-success font-medium">Bug report sent. Thank you!</p>
        </div>
      )}
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);

  return (
    <div className="fixed bottom-20 right-4 md:bottom-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} {...toast} />
      ))}
      <style jsx>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(100%); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
