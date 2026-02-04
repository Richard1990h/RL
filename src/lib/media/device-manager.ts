// getUserMedia / getDisplayMedia wrapper with fallbacks

import { buildVideoConstraints, buildAudioConstraints, buildScreenConstraints, type QualityPreset } from "./constraints";

export interface DeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

export async function enumerateDevices(): Promise<{
  cameras: DeviceInfo[];
  microphones: DeviceInfo[];
  speakers: DeviceInfo[];
}> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: devices
      .filter((d) => d.kind === "videoinput")
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 4)}`, kind: d.kind })),
    microphones: devices
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 4)}`, kind: d.kind })),
    speakers: devices
      .filter((d) => d.kind === "audiooutput")
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 4)}`, kind: d.kind })),
  };
}

export async function getUserMediaStream(options: {
  video: boolean;
  audio: boolean;
  quality?: QualityPreset;
  cameraId?: string;
  micId?: string;
}): Promise<MediaStream> {
  const { video, audio, quality = "720p", cameraId, micId } = options;

  const constraints: MediaStreamConstraints = {
    video: video ? buildVideoConstraints(quality, cameraId) : false,
    audio: audio ? buildAudioConstraints(micId) : false,
  };

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    // Fallback: try without specific device IDs
    if (cameraId || micId) {
      const fallback: MediaStreamConstraints = {
        video: video ? buildVideoConstraints(quality) : false,
        audio: audio ? buildAudioConstraints() : false,
      };
      return await navigator.mediaDevices.getUserMedia(fallback);
    }
    throw err;
  }
}

export async function getScreenStream(): Promise<MediaStream> {
  return await navigator.mediaDevices.getDisplayMedia(buildScreenConstraints());
}

export function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

export function setTrackEnabled(stream: MediaStream | null, kind: "audio" | "video", enabled: boolean) {
  if (!stream) return;
  const tracks = kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();
  tracks.forEach((track) => {
    track.enabled = enabled;
  });
}
