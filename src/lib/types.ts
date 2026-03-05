// Rally Live - Core TypeScript Interfaces

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
  bio?: string | null;
  followerCount: number;
  followingCount: number;
  isCreator: boolean;
  verifiedBadge: boolean;
  isPremium?: boolean;
  wallet?: {
    credits: number;
  } | null;
}

export interface Video {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  durationSec: number;
  creatorId: string;
  views: number;
  likes: number;
  dislikes: number;
  commentsCount: number;
  uploadDate: string;
  tags: string[];
  seriesId?: string;
  seriesOrder?: number;
  autoplayNextVideoId?: string;
}

export interface SeriesEpisode {
  videoId: string;
  order: number;
  titleOverride?: string;
}

export interface Series {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  creatorId: string;
  totalEpisodes: number;
  episodes: SeriesEpisode[];
}

export interface LiveRoomParticipant {
  userId: string;
  role: "host" | "guest";
}

export interface LiveRoom {
  id: string;
  hostId: string;
  title: string;
  tags: string[];
  viewerCount: number;
  isBattleRoom: boolean;
  participants: LiveRoomParticipant[];
  mode: "standard" | "timer_wars" | "tower_wars" | "rooms" | "trivia" | "auction" | "spin_wheel" | "last_standing";
  startTime: string;
  roundTimeSec: number;
  hostCutPercent: number;
}

export interface DonationTier {
  id: string;
  name: string;
  valueCents: number;
  iconKey: string;
  rarityColor: string;
  animationType: "none" | "sparkle" | "explosion" | "takeover";
  category: string;
}

export interface TowerUnit {
  unitId: string;
  name: string;
  costCents: number;
  type: "infantry" | "tank" | "anti_air" | "air" | "support";
  counters: string[];
  hp: number;
  damage: number;
  speed: number;
  iconKey: string;
  spawnAnimation: string;
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  timestamp: string;
  relatedId?: string;
}

export interface Comment {
  id: string;
  userId: string;
  videoId: string;
  text: string;
  timestamp: string;
  likes: number;
}

export interface Friend {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastActiveAt: string | null;
  friendshipId: string;
  friendsSince: string;
}

export interface FriendRequest {
  id: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  createdAt: string;
}
