// Adaptive bitrate based on RTCStats

import type { QualityPreset } from "@/lib/media/constraints";
import { QUALITY_PRESETS } from "@/lib/media/constraints";
import type { ConnectionHealth } from "./connection-monitor";

export interface QualityAdapterCallbacks {
  onQualityChange: (preset: QualityPreset, reason: string) => void;
  onAudioOnlyMode: (enabled: boolean) => void;
}

export class QualityAdapter {
  private currentPreset: QualityPreset = "720p";
  private audioOnly = false;
  private callbacks: QualityAdapterCallbacks;
  private stabilityCount = 0;
  private static readonly STABILITY_THRESHOLD = 3; // Consecutive checks before upgrading

  constructor(callbacks: QualityAdapterCallbacks) {
    this.callbacks = callbacks;
  }

  get preset(): QualityPreset {
    return this.currentPreset;
  }

  get isAudioOnly(): boolean {
    return this.audioOnly;
  }

  processHealthUpdate(health: ConnectionHealth) {
    const targetPreset = this.getTargetPreset(health);
    const targetAudioOnly = health.quality === "bad" && health.bitrate < 300;

    // Downgrade immediately
    if (this.presetLevel(targetPreset) < this.presetLevel(this.currentPreset)) {
      this.stabilityCount = 0;
      this.setPreset(targetPreset, `Bandwidth: ${Math.round(health.bitrate)}kbps, RTT: ${Math.round(health.rtt)}ms`);
    }
    // Upgrade only after stability threshold
    else if (this.presetLevel(targetPreset) > this.presetLevel(this.currentPreset)) {
      this.stabilityCount++;
      if (this.stabilityCount >= QualityAdapter.STABILITY_THRESHOLD) {
        this.stabilityCount = 0;
        this.setPreset(targetPreset, `Stable bandwidth: ${Math.round(health.bitrate)}kbps`);
      }
    } else {
      this.stabilityCount = 0;
    }

    // Audio-only mode
    if (targetAudioOnly !== this.audioOnly) {
      this.audioOnly = targetAudioOnly;
      this.callbacks.onAudioOnlyMode(targetAudioOnly);
    }
  }

  private getTargetPreset(health: ConnectionHealth): QualityPreset {
    const { bitrate } = health;
    if (bitrate > QUALITY_PRESETS["1080p"].maxBitrate * 0.8) return "1080p";
    if (bitrate > QUALITY_PRESETS["720p"].maxBitrate * 0.8) return "720p";
    if (bitrate > QUALITY_PRESETS["480p"].maxBitrate * 0.8) return "480p";
    return "360p";
  }

  private setPreset(preset: QualityPreset, reason: string) {
    if (preset !== this.currentPreset) {
      this.currentPreset = preset;
      this.callbacks.onQualityChange(preset, reason);
    }
  }

  private presetLevel(preset: QualityPreset): number {
    const levels: Record<QualityPreset, number> = {
      "360p": 0,
      "480p": 1,
      "720p": 2,
      "1080p": 3,
    };
    return levels[preset];
  }

  reset() {
    this.currentPreset = "720p";
    this.audioOnly = false;
    this.stabilityCount = 0;
  }
}
