// ICE server configuration for WebRTC connections

export interface IceConfig {
  iceServers: RTCIceServer[];
  iceCandidatePoolSize: number;
}

const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export function getIceConfig(): IceConfig {
  const servers: RTCIceServer[] = [...DEFAULT_STUN_SERVERS];

  // Add TURN server if configured
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrl && turnUser && turnCred) {
    servers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnCred,
    });
  }

  return {
    iceServers: servers,
    iceCandidatePoolSize: 10,
  };
}
