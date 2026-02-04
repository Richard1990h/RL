// SSE-based signaling client for WebRTC

import { SSEClient } from "@/lib/sse/sse-client";

export type SignalType = "offer" | "answer" | "ice-candidate" | "join" | "leave";

export interface SignalMessage {
  type: SignalType;
  from: string;
  to?: string;
  payload: unknown;
}

export interface SignalingCallbacks {
  onOffer: (from: string, offer: RTCSessionDescriptionInit) => void;
  onAnswer: (from: string, answer: RTCSessionDescriptionInit) => void;
  onIceCandidate: (from: string, candidate: RTCIceCandidateInit) => void;
  onPeerJoined: (peerId: string, userId: string) => void;
  onPeerLeft: (peerId: string) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

export class SignalingClient {
  private sse: SSEClient;
  private streamId: string;
  private userId: string;
  private callbacks: SignalingCallbacks;

  constructor(streamId: string, userId: string, callbacks: SignalingCallbacks) {
    this.streamId = streamId;
    this.userId = userId;
    this.callbacks = callbacks;

    this.sse = new SSEClient({
      url: `/api/live/${streamId}/signaling?userId=${userId}`,
      onMessage: (event, data) => this.handleMessage(event, data),
      onOpen: () => this.callbacks.onConnected(),
      onClose: () => this.callbacks.onDisconnected(),
    });
  }

  connect() {
    this.sse.connect();
  }

  disconnect() {
    this.sse.disconnect();
  }

  get isConnected(): boolean {
    return this.sse.isConnected;
  }

  private handleMessage(event: string, data: unknown) {
    const msg = data as SignalMessage;
    if (!msg || !msg.type) return;

    // Ignore messages from self
    if (msg.from === this.userId) return;

    switch (msg.type) {
      case "offer":
        this.callbacks.onOffer(msg.from, msg.payload as RTCSessionDescriptionInit);
        break;
      case "answer":
        this.callbacks.onAnswer(msg.from, msg.payload as RTCSessionDescriptionInit);
        break;
      case "ice-candidate":
        this.callbacks.onIceCandidate(msg.from, msg.payload as RTCIceCandidateInit);
        break;
      case "join":
        this.callbacks.onPeerJoined(msg.from, (msg.payload as { userId: string }).userId);
        break;
      case "leave":
        this.callbacks.onPeerLeft(msg.from);
        break;
    }
  }

  async sendSignal(type: SignalType, payload: unknown, to?: string) {
    const message: SignalMessage = {
      type,
      from: this.userId,
      to,
      payload,
    };

    await fetch(`/api/live/${this.streamId}/signaling`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(message),
    });
  }

  async sendOffer(to: string, offer: RTCSessionDescriptionInit) {
    await this.sendSignal("offer", offer, to);
  }

  async sendAnswer(to: string, answer: RTCSessionDescriptionInit) {
    await this.sendSignal("answer", answer, to);
  }

  async sendIceCandidate(to: string, candidate: RTCIceCandidateInit) {
    await this.sendSignal("ice-candidate", candidate, to);
  }

  async announceJoin() {
    await this.sendSignal("join", { userId: this.userId });
  }

  async announceLeave() {
    await this.sendSignal("leave", { userId: this.userId });
  }
}
