"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, UserPlus, Check, X } from "lucide-react";
import type { User } from "@/lib/types";
import Avatar from "@/components/ui/Avatar";

interface ChatMessage {
  id: string;
  userId: string;
  text: string;
  timestamp: number;
}

type RequestStatus = "none" | "pending" | "accepted" | "rejected";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  users: User[];
  /** If provided, show a "Join Queue" button above the send input */
  onJoinQueue?: () => void;
  /** Whether a queue join is in progress */
  queueJoining?: boolean;
  /** Whether the user is already in the queue */
  inQueue?: boolean;
  /** Credit cost to join (0 = free) */
  queueCost?: number;
  /** Request-to-join status for guest approval flow */
  requestStatus?: RequestStatus;
}

export default function ChatPanel({ messages, onSend, users, onJoinQueue, queueJoining, inQueue, queueCost, requestStatus }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="flex flex-col h-full bg-bg-surface border border-border rounded-radius-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold text-text">Live Chat</h3>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar"
      >
        {messages.map((msg) => {
          const user = userMap.get(msg.userId);
          return (
            <div key={msg.id} className="flex items-start gap-2">
              <Avatar
                src={user?.avatarUrl}
                name={user?.displayName || "User"}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-primary-light">
                  {user?.username || "unknown"}
                </span>
                <p className="text-sm text-text break-words">{msg.text}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Join Queue / Request to Join Button (shown above input if available) */}
      {onJoinQueue && (
        <div className="px-3 pt-2 shrink-0">
          <button
            onClick={onJoinQueue}
            disabled={queueJoining || inQueue || requestStatus === "pending" || requestStatus === "accepted"}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-radius-md text-sm font-semibold transition-all ${
              inQueue || requestStatus === "accepted"
                ? "bg-success/10 text-success border border-success/30 cursor-default"
                : requestStatus === "pending"
                ? "bg-warning/10 text-warning border border-warning/30 cursor-default"
                : requestStatus === "rejected"
                ? "bg-danger/10 text-danger border border-danger/30 cursor-default"
                : "bg-gradient-to-r from-primary to-accent text-white hover:opacity-90 disabled:opacity-50"
            }`}
          >
            {queueJoining ? (
              <Loader2 size={16} className="animate-spin" />
            ) : requestStatus === "accepted" || inQueue ? (
              <>
                <Check size={16} />
                Joined!
              </>
            ) : requestStatus === "pending" ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Request Pending...
              </>
            ) : requestStatus === "rejected" ? (
              <>
                <X size={16} />
                Request Denied
              </>
            ) : (
              <>
                <UserPlus size={16} />
                Request to Join{queueCost && queueCost > 0 ? ` (${queueCost} credits)` : ""}
              </>
            )}
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t border-border shrink-0">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            className="flex-1 bg-bg-surface2 text-text text-sm placeholder:text-text-muted px-3 py-2 rounded-radius-md border border-border focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2 rounded-radius-md bg-primary hover:bg-primary-dark text-white transition-colors disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
