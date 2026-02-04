// Connection resilience: ICE restart, reconnection, graceful degradation, toast notifications

import { MeshManager } from "./mesh-manager";
import { ConnectionMonitor, type ConnectionHealth } from "./connection-monitor";
import { QualityAdapter } from "./quality-adapter";
import type { QualityPreset } from "@/lib/media/constraints";
import type { PeerConnectionState } from "./peer-connection";

export interface ResilienceCallbacks {
  onToast: (message: string, type: "info" | "warning" | "error" | "success") => void;
  onQualityChange: (preset: QualityPreset) => void;
  onAudioOnlyChange: (audioOnly: boolean) => void;
  onReconnecting: (peerId: string) => void;
  onReconnected: (peerId: string) => void;
  onPeerLost: (peerId: string) => void;
}

export class ResilienceManager {
  private monitor: ConnectionMonitor;
  private adapter: QualityAdapter;
  private mesh: MeshManager;
  private callbacks: ResilienceCallbacks;
  private reconnectingPeers = new Set<string>();

  constructor(mesh: MeshManager, callbacks: ResilienceCallbacks) {
    this.mesh = mesh;
    this.callbacks = callbacks;

    this.adapter = new QualityAdapter({
      onQualityChange: (preset, reason) => {
        callbacks.onQualityChange(preset);
        callbacks.onToast(`Video quality adjusted to ${preset}`, "info");
      },
      onAudioOnlyMode: (enabled) => {
        callbacks.onAudioOnlyChange(enabled);
        if (enabled) {
          callbacks.onToast("Switched to audio-only mode due to poor connection", "warning");
        } else {
          callbacks.onToast("Video restored", "success");
        }
      },
    });

    this.monitor = new ConnectionMonitor({
      onHealthUpdate: (health) => this.handleHealthUpdate(health),
      onIceRestart: (peerId) => this.handleIceRestart(peerId),
      onDisconnected: (peerId) => this.handleDisconnected(peerId),
    });
  }

  startMonitoringPeer(peerId: string) {
    const peer = this.mesh.peerList.find((p) => p.peerId === peerId);
    if (peer) {
      this.monitor.startMonitoring(peer.connection);
    }
  }

  stopMonitoringPeer(peerId: string) {
    this.monitor.stopMonitoring(peerId);
    this.reconnectingPeers.delete(peerId);
  }

  destroy() {
    this.monitor.stopAll();
    this.adapter.reset();
    this.reconnectingPeers.clear();
  }

  private handleHealthUpdate(health: ConnectionHealth) {
    this.adapter.processHealthUpdate(health);

    // Check if a reconnecting peer has recovered
    if (this.reconnectingPeers.has(health.peerId) && health.state === "connected") {
      this.reconnectingPeers.delete(health.peerId);
      this.callbacks.onReconnected(health.peerId);
      this.callbacks.onToast("Connection restored", "success");
    }
  }

  private async handleIceRestart(peerId: string) {
    if (!this.reconnectingPeers.has(peerId)) {
      this.reconnectingPeers.add(peerId);
      this.callbacks.onReconnecting(peerId);
      this.callbacks.onToast("Connection unstable, reconnecting...", "warning");
    }

    // Trigger ICE restart on the peer connection
    const peer = this.mesh.peerList.find((p) => p.peerId === peerId);
    if (peer) {
      try {
        const offer = await peer.connection.createOffer(true); // iceRestart = true
        // The signaling client will handle sending the offer
      } catch (err) {
        console.error(`[resilience] ICE restart failed for ${peerId}:`, err);
      }
    }
  }

  private handleDisconnected(peerId: string) {
    this.reconnectingPeers.delete(peerId);
    this.callbacks.onPeerLost(peerId);
    this.callbacks.onToast("A participant disconnected", "error");
  }
}
