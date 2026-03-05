import type { LiveStatus } from "@/generated/prisma";

export type LiveSessionState = "scheduled" | "live" | "ending" | "ended";

const ENDING_TTL_MS = 20_000;
const endingUntil = new Map<string, number>();

function nowMs() {
  return Date.now();
}

export function markSessionEnding(streamId: string, ttlMs = ENDING_TTL_MS) {
  endingUntil.set(streamId, nowMs() + ttlMs);
}

function isEnding(streamId: string): boolean {
  const until = endingUntil.get(streamId);
  if (!until) return false;
  if (until < nowMs()) {
    endingUntil.delete(streamId);
    return false;
  }
  return true;
}

export function statusToSessionState(status: LiveStatus, streamId: string): LiveSessionState {
  if (isEnding(streamId)) return "ending";
  if (status === "WAITING") return "scheduled";
  if (status === "LIVE") return "live";
  return "ended";
}

export function getAllowedTransitions(state: LiveSessionState): LiveSessionState[] {
  switch (state) {
    case "scheduled":
      return ["live", "ended"];
    case "live":
      return ["ending", "ended"];
    case "ending":
      return ["ended"];
    case "ended":
      return [];
  }
}

export function canTransition(from: LiveSessionState, to: LiveSessionState): boolean {
  return getAllowedTransitions(from).includes(to);
}

export function buildSessionEnvelope(stream: { id: string; status: LiveStatus; startedAt?: Date | null; endedAt?: Date | null }) {
  const state = statusToSessionState(stream.status, stream.id);
  return {
    sessionId: stream.id,
    state,
    authority: "server" as const,
    startedAt: stream.startedAt ?? null,
    endedAt: stream.endedAt ?? null,
    allowedTransitions: getAllowedTransitions(state),
  };
}

