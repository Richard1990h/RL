// RTCPeerConnection wrapper with ICE handling

import { getIceConfig } from "./ice-config";

export type PeerConnectionState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";

export interface PeerConnectionCallbacks {
  onTrack: (stream: MediaStream) => void;
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onStateChange: (state: PeerConnectionState) => void;
  onNegotiationNeeded?: () => void;
}

export class PeerConnection {
  readonly peerId: string;
  private pc: RTCPeerConnection;
  private callbacks: PeerConnectionCallbacks;
  private remoteStream: MediaStream;
  private _state: PeerConnectionState = "new";

  constructor(peerId: string, callbacks: PeerConnectionCallbacks) {
    this.peerId = peerId;
    this.callbacks = callbacks;
    this.remoteStream = new MediaStream();

    const config = getIceConfig();
    this.pc = new RTCPeerConnection(config);

    this.pc.ontrack = (ev) => {
      ev.streams[0]?.getTracks().forEach((track) => {
        this.remoteStream.addTrack(track);
      });
      // Fallback: if no streams, add track directly
      if (!ev.streams[0]) {
        this.remoteStream.addTrack(ev.track);
      }
      this.callbacks.onTrack(this.remoteStream);
    };

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.callbacks.onIceCandidate(ev.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState as PeerConnectionState;
      this._state = state;
      this.callbacks.onStateChange(state);
    };

    this.pc.oniceconnectionstatechange = () => {
      // Map ICE connection state to our state for earlier detection
      const iceState = this.pc.iceConnectionState;
      if (iceState === "disconnected" && this._state !== "disconnected") {
        this._state = "disconnected";
        this.callbacks.onStateChange("disconnected");
      }
    };

    this.pc.onnegotiationneeded = () => {
      this.callbacks.onNegotiationNeeded?.();
    };
  }

  get state(): PeerConnectionState {
    return this._state;
  }

  get rawConnection(): RTCPeerConnection {
    return this.pc;
  }

  addTrack(track: MediaStreamTrack, stream: MediaStream) {
    this.pc.addTrack(track, stream);
  }

  replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack) {
    const sender = this.pc.getSenders().find((s) => s.track === oldTrack);
    if (sender) {
      sender.replaceTrack(newTrack);
    }
  }

  removeTrack(track: MediaStreamTrack) {
    const sender = this.pc.getSenders().find((s) => s.track === track);
    if (sender) {
      this.pc.removeTrack(sender);
    }
  }

  async createOffer(iceRestart = false): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer({ iceRestart });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(desc));
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  async getStats(): Promise<RTCStatsReport> {
    return this.pc.getStats();
  }

  getSenders(): RTCRtpSender[] {
    return this.pc.getSenders();
  }

  close() {
    this._state = "closed";
    this.pc.close();
    this.callbacks.onStateChange("closed");
  }
}
