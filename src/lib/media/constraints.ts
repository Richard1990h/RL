// Media quality presets and constraint builders

export type QualityPreset = "360p" | "480p" | "720p" | "1080p";

export interface QualityConfig {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number; // kbps
  label: string;
}

export const QUALITY_PRESETS: Record<QualityPreset, QualityConfig> = {
  "360p": { width: 640, height: 360, frameRate: 15, maxBitrate: 500, label: "Low (360p)" },
  "480p": { width: 854, height: 480, frameRate: 24, maxBitrate: 1000, label: "Medium (480p)" },
  "720p": { width: 1280, height: 720, frameRate: 30, maxBitrate: 2000, label: "HD (720p)" },
  "1080p": { width: 1920, height: 1080, frameRate: 30, maxBitrate: 4000, label: "Full HD (1080p)" },
};

export const DEFAULT_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
};

export function buildVideoConstraints(
  preset: QualityPreset,
  deviceId?: string
): MediaTrackConstraints {
  const config = QUALITY_PRESETS[preset];
  const constraints: MediaTrackConstraints = {
    width: { ideal: config.width },
    height: { ideal: config.height },
    frameRate: { ideal: config.frameRate },
  };
  if (deviceId) {
    constraints.deviceId = { exact: deviceId };
  }
  return constraints;
}

export function buildAudioConstraints(deviceId?: string): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = { ...DEFAULT_AUDIO_CONSTRAINTS };
  if (deviceId) {
    constraints.deviceId = { exact: deviceId };
  }
  return constraints;
}

export function buildScreenConstraints(): DisplayMediaStreamOptions {
  return {
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    },
    audio: true,
  };
}
