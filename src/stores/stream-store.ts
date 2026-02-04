// Stream store - manages local/remote streams, device state, connection states

import { create } from "zustand";
import type { QualityPreset } from "@/lib/media/constraints";
import type { PeerConnectionState } from "@/lib/webrtc/peer-connection";

export interface RemotePeer {
  peerId: string;
  userId: string;
  stream: MediaStream | null;
  state: PeerConnectionState;
  quality: "good" | "fair" | "poor" | "bad";
  audioOnly: boolean;
}

export interface DeviceState {
  cameraOn: boolean;
  micOn: boolean;
  screenSharing: boolean;
  selectedCameraId: string | null;
  selectedMicId: string | null;
}

export interface StreamState {
  // Local
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  deviceState: DeviceState;
  qualityPreset: QualityPreset;
  audioOnly: boolean;

  // Remote peers
  remotePeers: Map<string, RemotePeer>;

  // Connection
  signalingConnected: boolean;
  reconnecting: boolean;

  // Actions
  setLocalStream: (stream: MediaStream | null) => void;
  setScreenStream: (stream: MediaStream | null) => void;
  setDeviceState: (state: Partial<DeviceState>) => void;
  setQualityPreset: (preset: QualityPreset) => void;
  setAudioOnly: (audioOnly: boolean) => void;
  addRemotePeer: (peerId: string, userId: string) => void;
  updateRemotePeer: (peerId: string, updates: Partial<RemotePeer>) => void;
  removeRemotePeer: (peerId: string) => void;
  setRemotePeerStream: (peerId: string, stream: MediaStream) => void;
  setSignalingConnected: (connected: boolean) => void;
  setReconnecting: (reconnecting: boolean) => void;
  reset: () => void;
}

const initialDeviceState: DeviceState = {
  cameraOn: true,
  micOn: true,
  screenSharing: false,
  selectedCameraId: null,
  selectedMicId: null,
};

export const useStreamStore = create<StreamState>((set) => ({
  localStream: null,
  screenStream: null,
  deviceState: { ...initialDeviceState },
  qualityPreset: "720p",
  audioOnly: false,
  remotePeers: new Map(),
  signalingConnected: false,
  reconnecting: false,

  setLocalStream: (stream) => set({ localStream: stream }),
  setScreenStream: (stream) => set({ screenStream: stream }),
  setDeviceState: (partial) =>
    set((state) => ({
      deviceState: { ...state.deviceState, ...partial },
    })),
  setQualityPreset: (preset) => set({ qualityPreset: preset }),
  setAudioOnly: (audioOnly) => set({ audioOnly }),

  addRemotePeer: (peerId, userId) =>
    set((state) => {
      const peers = new Map(state.remotePeers);
      if (!peers.has(peerId)) {
        peers.set(peerId, {
          peerId,
          userId,
          stream: null,
          state: "new",
          quality: "good",
          audioOnly: false,
        });
      }
      return { remotePeers: peers };
    }),

  updateRemotePeer: (peerId, updates) =>
    set((state) => {
      const peers = new Map(state.remotePeers);
      const existing = peers.get(peerId);
      if (existing) {
        peers.set(peerId, { ...existing, ...updates });
      }
      return { remotePeers: peers };
    }),

  removeRemotePeer: (peerId) =>
    set((state) => {
      const peers = new Map(state.remotePeers);
      peers.delete(peerId);
      return { remotePeers: peers };
    }),

  setRemotePeerStream: (peerId, stream) =>
    set((state) => {
      const peers = new Map(state.remotePeers);
      const existing = peers.get(peerId);
      if (existing) {
        peers.set(peerId, { ...existing, stream });
      }
      return { remotePeers: peers };
    }),

  setSignalingConnected: (connected) => set({ signalingConnected: connected }),
  setReconnecting: (reconnecting) => set({ reconnecting }),

  reset: () =>
    set({
      localStream: null,
      screenStream: null,
      deviceState: { ...initialDeviceState },
      qualityPreset: "720p",
      audioOnly: false,
      remotePeers: new Map(),
      signalingConnected: false,
      reconnecting: false,
    }),
}));
