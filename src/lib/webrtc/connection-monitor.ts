// Detect disconnections and trigger ICE restart

import { PeerConnection, type PeerConnectionState } from "./peer-connection";

export interface ConnectionHealth {
  peerId: string;
  state: PeerConnectionState;
  rtt: number; // ms
  packetsLost: number;
  bitrate: number; // kbps
  quality: "good" | "fair" | "poor" | "bad";
}

export interface ConnectionMonitorCallbacks {
  onHealthUpdate: (health: ConnectionHealth) => void;
  onIceRestart: (peerId: string) => void;
  onDisconnected: (peerId: string) => void;
}

export class ConnectionMonitor {
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private previousStats: Map<string, { bytesReceived: number; timestamp: number }> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private callbacks: ConnectionMonitorCallbacks;

  private static readonly MONITOR_INTERVAL = 2000; // 2 seconds
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;

  constructor(callbacks: ConnectionMonitorCallbacks) {
    this.callbacks = callbacks;
  }

  startMonitoring(peer: PeerConnection) {
    this.stopMonitoring(peer.peerId);

    const interval = setInterval(async () => {
      const health = await this.checkHealth(peer);
      this.callbacks.onHealthUpdate(health);

      if (health.state === "disconnected" || health.state === "failed") {
        const attempts = this.reconnectAttempts.get(peer.peerId) || 0;
        if (attempts < ConnectionMonitor.MAX_RECONNECT_ATTEMPTS) {
          this.reconnectAttempts.set(peer.peerId, attempts + 1);
          this.callbacks.onIceRestart(peer.peerId);
        } else {
          this.callbacks.onDisconnected(peer.peerId);
          this.stopMonitoring(peer.peerId);
        }
      } else if (health.state === "connected") {
        this.reconnectAttempts.set(peer.peerId, 0);
      }
    }, ConnectionMonitor.MONITOR_INTERVAL);

    this.intervals.set(peer.peerId, interval);
  }

  stopMonitoring(peerId: string) {
    const interval = this.intervals.get(peerId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(peerId);
    }
    this.previousStats.delete(peerId);
    this.reconnectAttempts.delete(peerId);
  }

  stopAll() {
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals.clear();
    this.previousStats.clear();
    this.reconnectAttempts.clear();
  }

  private async checkHealth(peer: PeerConnection): Promise<ConnectionHealth> {
    const state = peer.state;
    let rtt = 0;
    let packetsLost = 0;
    let bitrate = 0;

    try {
      const stats = await peer.getStats();
      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
        }
        if (report.type === "inbound-rtp" && report.kind === "video") {
          packetsLost = report.packetsLost || 0;
          const bytesReceived = report.bytesReceived || 0;
          const timestamp = report.timestamp;

          const prev = this.previousStats.get(peer.peerId);
          if (prev) {
            const timeDelta = (timestamp - prev.timestamp) / 1000;
            if (timeDelta > 0) {
              bitrate = ((bytesReceived - prev.bytesReceived) * 8) / timeDelta / 1000; // kbps
            }
          }
          this.previousStats.set(peer.peerId, { bytesReceived, timestamp });
        }
      });
    } catch {
      // Stats may not be available
    }

    const quality = this.assessQuality(rtt, packetsLost, bitrate);

    return { peerId: peer.peerId, state, rtt, packetsLost, bitrate, quality };
  }

  private assessQuality(rtt: number, packetsLost: number, bitrate: number): ConnectionHealth["quality"] {
    if (bitrate > 2000 && rtt < 100 && packetsLost < 10) return "good";
    if (bitrate > 1000 && rtt < 200 && packetsLost < 50) return "fair";
    if (bitrate > 500 && rtt < 500) return "poor";
    return "bad";
  }
}
