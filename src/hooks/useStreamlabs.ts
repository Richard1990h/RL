"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export interface StreamlabsEvent {
  type: "donation" | "follow" | "subscription" | "host" | "bits" | "raid";
  from: string;
  amount?: number;
  currency?: string;
  message?: string;
  formattedAmount?: string;
}

interface StreamlabsOptions {
  /** Called for each incoming Streamlabs event */
  onEvent: (event: StreamlabsEvent) => void;
  /** Whether the hook should attempt to connect */
  enabled?: boolean;
}

/**
 * Connects to Streamlabs Socket API using the authenticated user's token.
 * Fetches the token from /api/creator/integrations/token on mount.
 */
export function useStreamlabs({ onEvent, enabled = true }: StreamlabsOptions) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }

    let cancelled = false;

    async function connect() {
      try {
        const res = await fetch("/api/creator/integrations/token", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const token = data.streamlabsToken;
        if (!token || cancelled) return;

        // Streamlabs Socket API v5 uses socket.io, but we can connect via
        // their WebSocket transport directly:
        // wss://sockets.streamlabs.com/socket.io/?token=TOKEN&transport=websocket&EIO=3
        const url = `wss://sockets.streamlabs.com/socket.io/?token=${encodeURIComponent(token)}&transport=websocket&EIO=3`;

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) { ws.close(); return; }
          setConnected(true);
          setError(null);
        };

        ws.onmessage = (evt) => {
          const raw = String(evt.data);

          // Socket.IO protocol: messages prefixed with packet type number
          // 0 = open, 2 = ping, 3 = pong, 42 = event message
          if (raw === "2") {
            // Ping — respond with pong
            ws.send("3");
            return;
          }

          if (!raw.startsWith("42")) return;

          try {
            const payload = JSON.parse(raw.slice(2));
            if (!Array.isArray(payload) || payload.length < 2) return;
            const [eventName, eventData] = payload;

            if (eventName === "event" && eventData) {
              const type = eventData.type as string;
              const messages = Array.isArray(eventData.message) ? eventData.message : [eventData.message];

              for (const msg of messages) {
                if (!msg) continue;
                const mapped: StreamlabsEvent = {
                  type: mapEventType(type),
                  from: msg.from || msg.name || "Someone",
                  amount: msg.amount ? Number(msg.amount) : undefined,
                  currency: msg.currency,
                  message: msg.message,
                  formattedAmount: msg.formattedAmount || msg.formatted_amount,
                };
                onEventRef.current(mapped);
              }
            }
          } catch {
            // Ignore non-JSON frames
          }
        };

        ws.onerror = () => {
          if (cancelled) return;
          setError("Streamlabs connection error");
          setConnected(false);
        };

        ws.onclose = () => {
          if (cancelled) return;
          setConnected(false);
          // Auto-reconnect after 5s
          reconnectTimer.current = setTimeout(() => {
            if (!cancelled) connect();
          }, 5000);
        };
      } catch (err) {
        if (!cancelled) setError("Failed to fetch Streamlabs token");
      }
    }

    connect();

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [enabled, disconnect]);

  return { connected, error, disconnect };
}

function mapEventType(type: string): StreamlabsEvent["type"] {
  switch (type) {
    case "donation": return "donation";
    case "follow": return "follow";
    case "subscription": return "subscription";
    case "host": return "host";
    case "bits": return "bits";
    case "raid": return "raid";
    default: return "donation";
  }
}
