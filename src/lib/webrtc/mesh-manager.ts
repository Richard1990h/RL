// Manages mesh of peer connections (up to 6 participants)

import { PeerConnection, type PeerConnectionState } from "./peer-connection";
import { SignalingClient } from "./signaling-client";

const MAX_PEERS = 6;

export interface MeshPeer {
  peerId: string;
  connection: PeerConnection;
  stream: MediaStream | null;
  state: PeerConnectionState;
}

export interface MeshCallbacks {
  onPeerAdded: (peerId: string, stream: MediaStream) => void;
  onPeerRemoved: (peerId: string) => void;
  onPeerStateChanged: (peerId: string, state: PeerConnectionState) => void;
  onConnectionEstablished: () => void;
  onError: (error: string) => void;
}

export class MeshManager {
  private peers: Map<string, MeshPeer> = new Map();
  private signaling: SignalingClient;
  private localStream: MediaStream | null = null;
  private callbacks: MeshCallbacks;
  private streamId: string;
  private userId: string;

  constructor(streamId: string, userId: string, callbacks: MeshCallbacks) {
    this.streamId = streamId;
    this.userId = userId;
    this.callbacks = callbacks;

    this.signaling = new SignalingClient(streamId, userId, {
      onOffer: (from, offer) => this.handleOffer(from, offer),
      onAnswer: (from, answer) => this.handleAnswer(from, answer),
      onIceCandidate: (from, candidate) => this.handleIceCandidate(from, candidate),
      onPeerJoined: (peerId) => this.handlePeerJoined(peerId),
      onPeerLeft: (peerId) => this.handlePeerLeft(peerId),
      onConnected: () => this.callbacks.onConnectionEstablished(),
      onDisconnected: () => {},
    });
  }

  get peerCount(): number {
    return this.peers.size;
  }

  get peerList(): MeshPeer[] {
    return Array.from(this.peers.values());
  }

  async start(localStream: MediaStream) {
    this.localStream = localStream;
    this.signaling.connect();

    // Announce our presence after a brief delay for SSE to stabilize
    setTimeout(() => {
      this.signaling.announceJoin();
    }, 500);
  }

  async stop() {
    await this.signaling.announceLeave();
    this.peers.forEach((peer) => peer.connection.close());
    this.peers.clear();
    this.signaling.disconnect();
  }

  updateLocalStream(stream: MediaStream) {
    const oldStream = this.localStream;
    this.localStream = stream;

    // Replace tracks on all existing peer connections
    this.peers.forEach((peer) => {
      const senders = peer.connection.getSenders();
      stream.getTracks().forEach((newTrack) => {
        const oldTrack = oldStream?.getTracks().find((t) => t.kind === newTrack.kind);
        if (oldTrack) {
          peer.connection.replaceTrack(oldTrack, newTrack);
        } else {
          peer.connection.addTrack(newTrack, stream);
        }
      });

      // Remove tracks that no longer exist
      if (oldStream) {
        oldStream.getTracks().forEach((oldTrack) => {
          if (!stream.getTracks().find((t) => t.kind === oldTrack.kind)) {
            peer.connection.removeTrack(oldTrack);
          }
        });
      }
    });
  }

  private createPeer(peerId: string): MeshPeer {
    const connection = new PeerConnection(peerId, {
      onTrack: (stream) => {
        const peer = this.peers.get(peerId);
        if (peer) {
          peer.stream = stream;
          this.callbacks.onPeerAdded(peerId, stream);
        }
      },
      onIceCandidate: (candidate) => {
        this.signaling.sendIceCandidate(peerId, candidate.toJSON());
      },
      onStateChange: (state) => {
        const peer = this.peers.get(peerId);
        if (peer) {
          peer.state = state;
          this.callbacks.onPeerStateChanged(peerId, state);

          if (state === "failed" || state === "closed") {
            this.removePeer(peerId);
          }
        }
      },
    });

    // Add local tracks to the connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        connection.addTrack(track, this.localStream!);
      });
    }

    const meshPeer: MeshPeer = {
      peerId,
      connection,
      stream: null,
      state: "new",
    };

    this.peers.set(peerId, meshPeer);
    return meshPeer;
  }

  private removePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connection.close();
      this.peers.delete(peerId);
      this.callbacks.onPeerRemoved(peerId);
    }
  }

  private async handlePeerJoined(peerId: string) {
    if (this.peers.has(peerId) || this.peers.size >= MAX_PEERS) return;

    const peer = this.createPeer(peerId);
    try {
      const offer = await peer.connection.createOffer();
      await this.signaling.sendOffer(peerId, offer);
    } catch (err) {
      this.callbacks.onError(`Failed to create offer for ${peerId}: ${err}`);
    }
  }

  private handlePeerLeft(peerId: string) {
    this.removePeer(peerId);
  }

  private async handleOffer(from: string, offer: RTCSessionDescriptionInit) {
    if (this.peers.size >= MAX_PEERS && !this.peers.has(from)) return;

    let peer = this.peers.get(from);
    if (!peer) {
      peer = this.createPeer(from);
    }

    try {
      await peer.connection.setRemoteDescription(offer);
      const answer = await peer.connection.createAnswer();
      await this.signaling.sendAnswer(from, answer);
    } catch (err) {
      this.callbacks.onError(`Failed to handle offer from ${from}: ${err}`);
    }
  }

  private async handleAnswer(from: string, answer: RTCSessionDescriptionInit) {
    const peer = this.peers.get(from);
    if (!peer) return;

    try {
      await peer.connection.setRemoteDescription(answer);
    } catch (err) {
      this.callbacks.onError(`Failed to handle answer from ${from}: ${err}`);
    }
  }

  private async handleIceCandidate(from: string, candidate: RTCIceCandidateInit) {
    const peer = this.peers.get(from);
    if (!peer) return;

    try {
      await peer.connection.addIceCandidate(candidate);
    } catch (err) {
      // ICE candidate errors are common during negotiation, log but don't propagate
      console.warn(`[mesh] ICE candidate error from ${from}:`, err);
    }
  }
}
