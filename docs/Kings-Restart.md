# King's Restart

> Complete inventory of every system in Rally Live — reference for rebuilding from scratch.
> Every system is prefixed HK_ for consistency.

---

## HK_ Platform Overview

- **Stack**: Next.js 15 + TypeScript + Tailwind CSS + Prisma + MySQL
- **Port**: 4500 (production via `next start`)
- **Auth**: Custom JWT cookies (no NextAuth)
- **Payments**: PayPal SDK
- **State**: Zustand stores (client-side)
- **Realtime**: WebRTC mesh + SSE polling
- **FiveM**: Lua resources synced via workspace system + AI bug/suggestion pipeline

---

## HK_ Pages (Frontend Routes)

| HK_ Name | Path | What It Is |
|---|---|---|
| HK_ Home | `/home` | Main feed — video grid |
| HK_ Login | `/login` | Email/password + Google OAuth login |
| HK_ Register | `/register` | Account creation |
| HK_ Watch | `/watch/[id]` | Video player page — comments, likes, donate |
| HK_ Upload | `/upload` | Chunked video upload |
| HK_ Upload Stream | `/upload-stream` | Upload from stream recording |
| HK_ Live List | `/live` | Browse active live streams |
| HK_ Live View | `/live/[id]` | Watch a live stream — chat, games, donate |
| HK_ Go Live | `/go-live` | Start broadcasting — device selector, settings |
| HK_ Battle | `/battle/[id]` | Split-screen viewer battle page |
| HK_ Profile | `/profile/[username]` | User profile — videos, followers, bio |
| HK_ Settings | `/settings` | Account settings — display name, avatar, etc. |
| HK_ Wallet | `/wallet` | Credits balance, deposit, withdraw, transfer |
| HK_ Credits | `/credits` | Buy credits via PayPal |
| HK_ Messages | `/messages` | DM conversations + streaks |
| HK_ Notifications | `/notifications` | Notification feed |
| HK_ Friends | `/friends` | Friends list, requests, timeouts |
| HK_ Creator Studio | `/creator-studio` | Creator analytics dashboard |
| HK_ Editor | `/editor/[id]` | In-browser video editor (trim, text, export) |
| HK_ Analytics | `/analytics` | Platform-wide analytics |
| HK_ Admin | `/admin` | Admin panel — users, bridge, treasury, services |
| HK_ Services | `/services` | Service marketplace (listings) |
| HK_ FiveM Hub | `/fivem` | FiveM server management list |
| HK_ FiveM Dashboard | `/fivem/[slug]` | Single FiveM server — bugs, suggestions, resources, members |
| HK_ FiveM Whitelist | `/fivem-whitelist` | Public whitelist application form |
| HK_ Offline | `/offline` | Offline-capable cached content |
| HK_ Install | `/install` | PWA install prompt page |
| HK_ Privacy | `/privacy` | Privacy policy |
| HK_ Terms | `/terms` | Terms of service |
| HK_ Community | `/community` | Community guidelines |

---

## HK_ Components

### HK_ Layout

| File | What It Is |
|---|---|
| `AppShell.tsx` | Main app wrapper — sidebar + topbar + content area |
| `TopBar.tsx` | Top navigation bar — logo, search, notifications, avatar |
| `Sidebar.tsx` | Desktop left sidebar navigation |
| `BottomTabs.tsx` | Mobile bottom tab bar |
| `MobileDrawer.tsx` | Mobile slide-out menu |
| `OfflineStatusBar.tsx` | Banner showing offline/sync status |

### HK_ UI Primitives

| File | What It Is |
|---|---|
| `Avatar.tsx` | User avatar circle |
| `Badge.tsx` | Status/count badge |
| `Button.tsx` | Standard button |
| `Card.tsx` | Content card container |
| `Drawer.tsx` | Slide-out drawer |
| `Input.tsx` | Form input field |
| `Modal.tsx` | Dialog overlay |
| `SegmentedControl.tsx` | Tab-style toggle |
| `Tabs.tsx` | Tab navigation |
| `Toast.tsx` | Toast notification popup |
| `UploadWidget.tsx` | File upload drag-drop area |

### HK_ Video

| File | What It Is |
|---|---|
| `VideoCard.tsx` | Thumbnail card in feed |
| `VideoPlayer.tsx` | Full video player with controls |
| `PlaylistPanel.tsx` | Video playlist sidebar |

### HK_ Live

| File | What It Is |
|---|---|
| `ChatPanel.tsx` | Live stream chat |
| `DeviceSelector.tsx` | Camera/mic picker for broadcasting |
| `DonationAlert.tsx` | On-screen donation animation |
| `LiveCard.tsx` | Live stream thumbnail in browse |
| `MediaPreview.tsx` | Camera preview before going live |
| `NetworkIndicator.tsx` | Connection quality indicator |
| `RecordingIndicator.tsx` | Recording status dot |
| `VideoTile.tsx` | Participant video tile in stream |

### HK_ Battle

| File | What It Is |
|---|---|
| `BattleBar.tsx` | Battle progress/score bar |
| `InviteBattleModal.tsx` | Send battle invite dialog |
| `LeaderboardPanel.tsx` | Battle leaderboard |
| `ParticipantBox.tsx` | Battle participant display |
| `PowerUpPanel.tsx` | Power-up shop during battle |
| `SplitScreenBattle.tsx` | Side-by-side battle view |
| `TeamBattleLayout.tsx` | Team battle layout |
| `VictoryLap.tsx` | Victory celebration animation |

### HK_ Editor

| File | What It Is |
|---|---|
| `VideoEditor.tsx` | Main editor canvas |
| `Timeline.tsx` | Scrub timeline |
| `ToolsPanel.tsx` | Editor toolbar (trim, text, etc.) |
| `PropertiesPanel.tsx` | Selected element properties |
| `TextOverlayCanvas.tsx` | Text overlay renderer |
| `TrimControls.tsx` | Trim start/end controls |
| `CutTool.tsx` | Cut/split tool |
| `ExportModal.tsx` | Export settings dialog |

### HK_ Other Components

| File | What It Is |
|---|---|
| `AuthProvider.tsx` | Auth context wrapper |
| `ErrorOverlayGuard.tsx` | Error boundary |
| `AnalyticsCard.tsx` | Creator stat card |
| `BarChart.tsx` | Bar chart visualization |
| `DonateButton.tsx` | Send credits button |
| `GiftPanel.tsx` | Gift credits panel |
| `FriendTimeoutModal.tsx` | Mute friend dialog |
| `OnlineFriendsWidget.tsx` | Online friends sidebar |

---

## HK_ API Routes

### HK_ Auth

| Route | Method | What It Does |
|---|---|---|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Email/password login |
| `/api/auth/logout` | POST | Clear session |
| `/api/auth/me` | GET | Current user info |
| `/api/auth/google` | GET | Google OAuth redirect |
| `/api/auth/callback/google` | GET | Google OAuth callback |
| `/api/auth/check-username` | GET | Username availability |
| `/api/auth/check-displayname` | GET | Display name availability |

### HK_ Videos

| Route | Method | What It Does |
|---|---|---|
| `/api/videos` | GET | List/search videos |
| `/api/videos/[id]` | GET/PATCH/DELETE | Single video CRUD |
| `/api/videos/[id]/like` | POST/DELETE | Like/unlike |
| `/api/videos/[id]/view` | POST | Record view |
| `/api/videos/[id]/impression` | POST | Record impression |
| `/api/videos/[id]/status` | GET | Processing status |
| `/api/videos/[id]/comments` | GET/POST | Comments |
| `/api/videos/[id]/comments/[commentId]/like` | POST | Like comment |
| `/api/videos/[id]/donate` | POST | Donate credits to video |

### HK_ Upload

| Route | Method | What It Does |
|---|---|---|
| `/api/upload` | POST | Start upload (metadata) |
| `/api/upload/chunk` | POST | Upload chunk (binary) |
| `/api/upload/chunk-json` | POST | Upload chunk (JSON-encoded) |
| `/api/upload/complete` | POST | Finalize upload |
| `/api/upload/session` | POST | Create upload session |
| `/api/upload/stream-gallery` | POST | Upload from stream recording |
| `/api/upload/thumbnail` | POST | Upload custom thumbnail |
| `/api/uploads/[...path]` | GET | Serve uploaded files |

### HK_ Live Streaming

| Route | Method | What It Does |
|---|---|---|
| `/api/live` | GET/POST | List streams / create stream |
| `/api/live/eligibility` | GET | Check if user can go live |
| `/api/live/[id]` | GET/PATCH/DELETE | Stream CRUD |
| `/api/live/[id]/join` | POST | Join as viewer |
| `/api/live/[id]/leave` | POST | Leave stream |
| `/api/live/[id]/chat` | GET/POST | Chat messages |
| `/api/live/[id]/ice` | POST | WebRTC ICE candidates |
| `/api/live/[id]/signaling` | POST | WebRTC signaling |
| `/api/live/[id]/frame` | POST | Thumbnail frame capture |
| `/api/live/[id]/moderate` | POST | Mod actions (ban/mute) |
| `/api/live/[id]/approve` | POST | Approve join request |
| `/api/live/[id]/hls` | GET | HLS playlist |
| `/api/live/[id]/game/state` | GET | Game state |
| `/api/live/[id]/game/action` | POST | Game action |
| `/api/live/[id]/game/gift` | POST | Gift during game |
| `/api/live/[id]/game/power-up` | POST | Buy power-up |
| `/api/live/ingest/auth` | POST | RTMP ingest auth |
| `/api/live/ingest/end` | POST | RTMP stream ended |

### HK_ Users & Social

| Route | Method | What It Does |
|---|---|---|
| `/api/users` | GET | Search users |
| `/api/users/[id]` | GET/PATCH | User profile |
| `/api/users/[id]/follow` | POST/DELETE | Follow/unfollow |
| `/api/users/[id]/followers` | GET | Follower list |
| `/api/users/[id]/following` | GET | Following list |
| `/api/users/[id]/block` | POST/DELETE | Block/unblock |
| `/api/users/blocked` | GET | Blocked users list |
| `/api/users/[id]/friend-request` | POST | Send friend request |
| `/api/users/[id]/friend-request/respond` | POST | Accept/reject |
| `/api/users/[id]/friend` | DELETE | Remove friend |
| `/api/users/[id]/friend/timeout` | POST | Timeout friend |
| `/api/friends` | GET | Friends list |
| `/api/friends/requests` | GET | Pending requests |
| `/api/friends/timeouts` | GET | Active timeouts |

### HK_ Messages

| Route | Method | What It Does |
|---|---|---|
| `/api/messages` | GET | Conversation list |
| `/api/messages/[conversationUserId]` | GET/POST | Messages in conversation |
| `/api/messages/[conversationUserId]/open` | POST | Mark as read |
| `/api/messages/streak` | GET | Message streak info |

### HK_ Wallet & Payments

| Route | Method | What It Does |
|---|---|---|
| `/api/wallet` | GET | Balance + history |
| `/api/wallet/credits` | GET | Credits info |
| `/api/wallet/deposit` | POST | Deposit credits |
| `/api/wallet/withdraw` | POST | Withdraw credits |
| `/api/wallet/transfer` | POST | Transfer to user |
| `/api/wallet/fees` | GET | Fee schedule |
| `/api/paypal/config` | GET | PayPal client ID |
| `/api/paypal/create-order` | POST | Create PayPal order |
| `/api/paypal/capture-order` | POST | Capture payment |
| `/api/webhooks/paypal` | POST | PayPal webhook |
| `/api/subscription` | GET/POST/DELETE | Subscription management |
| `/api/subscription/paypal/create-order` | POST | Subscription PayPal order |
| `/api/subscription/paypal/capture-order` | POST | Subscription PayPal capture |

### HK_ Admin

| Route | Method | What It Does |
|---|---|---|
| `/api/admin` | GET | Admin dashboard data |
| `/api/admin/users` | GET | User list |
| `/api/admin/users/[id]/role` | PATCH | Change user role |
| `/api/admin/alerts` | GET/POST | System alerts |
| `/api/admin/audit` | GET | Audit log |
| `/api/admin/command` | POST | Run admin command |
| `/api/admin/reprocess-videos` | POST | Reprocess stuck videos |
| `/api/admin/treasury` | GET | Treasury balance |
| `/api/admin/treasury/config` | GET/PATCH | Treasury settings |
| `/api/admin/upload-image` | POST | Upload image (admin) |
| `/api/admin/services/status` | GET | Service health check |
| `/api/admin/claude-session` | GET/POST | Claude session management |
| `/api/admin/device` | GET | Approved devices |
| `/api/admin/device/approve` | POST | Approve device |
| `/api/admin/device-tool` | GET/POST | Device management tool |
| `/api/admin/device-tool/challenge` | POST | Device auth challenge |

### HK_ Bridge (Desktop Automation)

| Route | Method | What It Does |
|---|---|---|
| `/api/admin/bridge/windows` | GET | List open windows |
| `/api/admin/bridge/select` | POST | Select a window |
| `/api/admin/bridge/send` | POST | Send keystrokes |
| `/api/admin/bridge/launch` | POST | Launch application |
| `/api/admin/bridge/disconnect` | POST | Disconnect bridge |
| `/api/admin/bridge/log` | GET | Bridge logs |
| `/api/admin/bridge/thumbnails` | GET | Window thumbnails |
| `/api/admin/bridge/monitor` | POST | Start monitoring window |
| `/api/admin/bridge/monitor-output` | GET | Monitor output |
| `/api/admin/bridge/unmonitor` | POST | Stop monitoring |

### HK_ Ads

| Route | Method | What It Does |
|---|---|---|
| `/api/ads/settings` | GET/PATCH | Ad configuration |
| `/api/ads/custom` | GET/POST | Custom ad CRUD |
| `/api/ads/custom/[id]` | PATCH/DELETE | Edit/delete ad |
| `/api/ads/custom/serve` | GET | Serve an ad to viewer |
| `/api/ads/custom/price` | GET | Ad pricing |
| `/api/ads/custom/admin` | GET | Admin ad overview |
| `/api/ads/custom/payouts` | GET | Ad revenue payouts |

### HK_ FiveM Server Management

| Route | Method | What It Does |
|---|---|---|
| `/api/fivem/servers` | GET/POST | Server list / register |
| `/api/fivem/servers/subscribe-create` | POST | Create with subscription |
| `/api/fivem/servers/[slug]` | GET/PATCH/DELETE | Server CRUD |
| `/api/fivem/servers/[slug]/save` | POST | Save server settings |
| `/api/fivem/servers/[slug]/rotate-key` | POST | Rotate API key |
| `/api/fivem/servers/[slug]/heartbeat` | POST | Server heartbeat |
| `/api/fivem/servers/[slug]/members` | GET/POST/DELETE | Team members |
| `/api/fivem/servers/[slug]/jobs` | GET/POST/PATCH/DELETE | Job definitions |
| `/api/fivem/servers/[slug]/feed` | GET/POST | Server feed/announcements |
| `/api/fivem/servers/[slug]/logs` | GET/POST | Server logs |
| `/api/fivem/servers/[slug]/reports` | GET/POST | Player reports |
| `/api/fivem/servers/[slug]/reports/player` | GET/POST | Player-submitted reports |
| `/api/fivem/servers/[slug]/applications` | GET/PATCH | Whitelist applications |
| `/api/fivem/servers/[slug]/fees` | GET | Server fee schedule |
| `/api/fivem/servers/[slug]/comments` | GET/POST | Admin comments |
| `/api/fivem/servers/[slug]/vip` | GET | VIP packages |
| `/api/fivem/servers/[slug]/vip/buy` | POST | Buy VIP package |
| `/api/fivem/servers/[slug]/pending-commands` | GET/POST | Queued FiveM commands |

### HK_ FiveM Resources

| Route | Method | What It Does |
|---|---|---|
| `/api/fivem/servers/[slug]/resources/upload` | POST | Upload resources (zip or local path) |
| `/api/fivem/servers/[slug]/resources/tree` | GET | File tree browser |
| `/api/fivem/servers/[slug]/resources/sync` | POST | Sync resources |
| `/api/fivem/servers/[slug]/resources/push` | POST | Push workspace to FiveM server |
| `/api/fivem/servers/[slug]/resources/download` | GET | Download single file |
| `/api/fivem/servers/[slug]/resources/download-zip` | GET | Download folder as zip |

### HK_ FiveM AI System

| Route | Method | What It Does |
|---|---|---|
| `/api/fivem/servers/[slug]/bugs` | GET/POST | Bug report list / submit |
| `/api/fivem/servers/[slug]/bugs/player` | POST | Player-submitted bug |
| `/api/fivem/servers/[slug]/bugs/[id]` | GET/PATCH | Bug detail / trigger AI action |
| `/api/fivem/servers/[slug]/bugs/[id]/claude-response` | POST | AI result callback |
| `/api/fivem/servers/[slug]/suggestions` | GET/POST | Suggestion list / submit |
| `/api/fivem/servers/[slug]/suggestions/player` | POST | Player-submitted suggestion |
| `/api/fivem/servers/[slug]/suggestions/[id]` | GET/PATCH | Suggestion detail / trigger AI |
| `/api/fivem/servers/[slug]/suggestions/[id]/claude-response` | POST | AI result callback |
| `/api/fivem/servers/[slug]/ai-progress` | GET | AI progress polling |

### HK_ Other APIs

| Route | Method | What It Does |
|---|---|---|
| `/api/notifications` | GET/PATCH | Notifications |
| `/api/reports` | POST | Content reports |
| `/api/search` | GET | Global search |
| `/api/series` | GET/POST | Video series |
| `/api/series/[id]` | GET/PATCH/DELETE | Series CRUD |
| `/api/services` | GET/POST | Service marketplace |
| `/api/services/[id]` | GET/PATCH/DELETE | Service CRUD |
| `/api/services/[id]/order` | POST | Place service order |
| `/api/services/orders` | GET | My orders |
| `/api/services/orders/[orderId]` | PATCH | Update order |
| `/api/bugs` | GET/POST | Platform bug reports |
| `/api/bugs/[id]` | GET/PATCH | Platform bug CRUD |
| `/api/bugs/[id]/claude-response` | POST | Platform bug AI callback |
| `/api/platform/stats` | GET | Platform statistics |
| `/api/heartbeat` | GET | Health check |
| `/api/analytics` | GET | Analytics data |
| `/api/fivem/nui` | GET | NUI proxy |
| `/api/fivem/nui/[...path]` | GET | NUI asset proxy |
| `/api/fivem/whitelist` | POST | Submit whitelist app |
| `/api/offline/version` | GET | Offline version check |
| `/api/offline/prefetch-list` | GET | Prefetch manifest |
| `/api/offline/signed-manifest` | GET | Signed offline manifest |
| `/api/sync/actions` | POST | Offline action sync |
| `/api/battle/invite` | GET/POST | Battle invites |
| `/api/battle/invite/[id]` | PATCH/DELETE | Accept/decline invite |
| `/api/creator/live-settings` | GET/PATCH | Creator stream settings |
| `/api/creator/moderation` | GET/PATCH | Moderation settings |
| `/api/creator/integrations` | GET/PATCH | Third-party integrations |
| `/api/creator/integrations/token` | POST | Integration token exchange |
| `/api/creator/stream-key` | POST | Generate stream key |
| `/api/creator/whitelist` | GET/POST | Stream whitelist |
| `/api/editor/project` | GET/POST | Editor project save/load |
| `/api/editor/export` | POST | Trigger video export |
| `/api/recordings/[id]` | GET/DELETE | Recording CRUD |
| `/api/recordings/[id]/process` | POST | Process recording |
| `/api/recordings` | GET | List recordings |

---

## HK_ Libraries (src/lib/)

| HK_ Name | File | What It Does |
|---|---|---|
| HK_ API Client | `api.ts` | Frontend fetch wrapper |
| HK_ Auth | `auth.ts` | JWT token create/verify, getCurrentUser() |
| HK_ Database | `db.ts` | Prisma client singleton |
| HK_ Types | `types.ts` | Shared TypeScript types |
| HK_ Utils | `utils.ts` | General utility functions |
| HK_ Rate Limiter | `rate-limit.ts` | IP-based rate limiting |
| HK_ Security Policy | `security-policy.ts` | Security rules and validation |
| HK_ Auto Tags | `auto-tags.ts` | Auto-tag videos by title/content |
| HK_ Audit | `audit.ts` | Audit log writer |
| HK_ Bridge Proxy | `bridge-proxy.ts` | Desktop bridge communication |
| HK_ Credit Ledger | `credit-ledger.ts` | Credit transaction ledger |
| HK_ Device Auth | `device-auth.ts` | Device approval system |
| HK_ Donation Tiers | `donation-tiers.ts` | Donation amount tiers |
| HK_ PayPal | `paypal.ts` | PayPal SDK integration |
| HK_ Treasury | `treasury.ts` | Platform treasury management |
| HK_ User Storage | `user-storage.ts` | User file storage paths |
| HK_ Video Processing | `video-processing.ts` | FFmpeg video processing |

### HK_ FiveM Libs (src/lib/fivem/)

| File | What It Does |
|---|---|
| `ai-progress.ts` | In-memory AI progress tracking |
| `backup-guard.ts` | Require backup before code changes |
| `billing.ts` | FiveM subscription billing |
| `fees.ts` | FiveM fee calculation |
| `parse-resources.ts` | Parse resource names from AI output |
| `server-db.ts` | FiveM table creation + slug normalization |
| `server-logs.ts` | FiveM server log queries |
| `workspace.ts` | Workspace sync, push, backup, file tree |

### HK_ Game Engines (src/lib/games/)

| File | What It Does |
|---|---|
| `game-engine.ts` | Base game engine interface |
| `game-state-manager.ts` | Game state persistence |
| `auction-wars.ts` | Auction Wars game |
| `trivia-battle.ts` | Trivia Battle game |
| `timer-wars-server.ts` | Timer Wars game |
| `tower-wars-server.ts` | Tower Wars game |
| `spin-wheel.ts` | Spin the Wheel game |
| `last-one-standing.ts` | Last One Standing game |
| `power-ups.ts` | Power-up definitions |

### HK_ WebRTC (src/lib/webrtc/)

| File | What It Does |
|---|---|
| `peer-connection.ts` | WebRTC peer connection wrapper |
| `mesh-manager.ts` | Multi-peer mesh networking |
| `signaling-client.ts` | Signaling channel (SSE-based) |
| `ice-config.ts` | ICE/STUN/TURN config |
| `connection-monitor.ts` | Connection health monitoring |
| `quality-adapter.ts` | Adaptive quality (resolution/bitrate) |
| `resilience.ts` | Auto-reconnect logic |

### HK_ Media (src/lib/media/)

| File | What It Does |
|---|---|
| `constraints.ts` | MediaStream constraints |
| `device-manager.ts` | Camera/mic enumeration |
| `restream-rollout.ts` | Restream feature rollout |

### HK_ Recording (src/lib/recording/)

| File | What It Does |
|---|---|
| `media-recorder-manager.ts` | MediaRecorder wrapper |
| `chunk-uploader.ts` | Upload recording chunks |

### HK_ Editor (src/lib/editor/)

| File | What It Does |
|---|---|
| `timeline-state.ts` | Editor timeline state |
| `export-manager.ts` | Export pipeline |

### HK_ Offline (src/lib/offline/)

| File | What It Does |
|---|---|
| `bootstrap.ts` | Offline system init |
| `cache-manager.ts` | Cache strategy |
| `config.ts` | Offline config |
| `connectivity.ts` | Online/offline detection |
| `db.ts` | IndexedDB schema |
| `encryption.ts` | Offline content encryption |
| `native-bridge.ts` | Native app bridge |
| `native-filesystem.ts` | Native file access |
| `queue.ts` | Action queue |
| `segment-storage.ts` | Video segment cache |
| `server-signature.ts` | Server signature verification |
| `signature.ts` | Content signing |
| `types.ts` | Offline types |
| `upload-queue.ts` | Offline upload queue |

### HK_ Other Libs

| File | What It Does |
|---|---|
| `src/lib/sse/sse-client.ts` | SSE event stream client |
| `src/lib/live/session-state.ts` | Live session state management |

---

## HK_ Stores (Zustand)

| HK_ Name | File | What It Manages |
|---|---|---|
| HK_ Auth Store | `auth-store.ts` | Current user, login state |
| HK_ Broadcast Store | `broadcast-store.ts` | Broadcasting state (going live) |
| HK_ Editor Store | `editor-store.ts` | Video editor state |
| HK_ Friends Store | `friends-store.ts` | Friends list, requests |
| HK_ Game Store | `game-store.ts` | Active game state |
| HK_ Notification Store | `notification-store.ts` | Notification list + unread count |
| HK_ Recording Store | `recording-store.ts` | Recording state |
| HK_ Stream Store | `stream-store.ts` | Stream viewer state |
| HK_ UI Store | `ui-store.ts` | UI state (sidebar, modals, theme) |
| HK_ Upload Store | `upload-store.ts` | Upload progress state |
| HK_ Wallet Store | `wallet-store.ts` | Wallet balance + transactions |

---

## HK_ Database Models (Prisma)

| HK_ Name | Model | What It Stores |
|---|---|---|
| HK_ User | `User` | Accounts — email, username, displayName, avatar, role, bio |
| HK_ Session | `Session` | Active JWT sessions |
| HK_ Wallet | `Wallet` | User credit balance |
| HK_ Transaction | `Transaction` | Credit transactions (deposit, withdraw, transfer, donate) |
| HK_ Credit Ledger | `CreditLedger` | Detailed credit audit trail |
| HK_ Platform Settings | `PlatformSettings` | Global platform config |
| HK_ Video | `Video` | Uploaded videos — title, file path, thumbnail, status, tags |
| HK_ Video View | `VideoView` | View tracking per video |
| HK_ Series | `Series` | Video series/playlists |
| HK_ Comment | `Comment` | Video comments |
| HK_ Comment Like | `CommentLike` | Comment likes |
| HK_ Like | `Like` | Video likes |
| HK_ Follow | `Follow` | User follows |
| HK_ Block | `Block` | User blocks |
| HK_ Friend Request | `FriendRequest` | Pending friend requests |
| HK_ Friendship | `Friendship` | Active friendships |
| HK_ Friend Timeout | `FriendTimeout` | Temporary friend mutes |
| HK_ Message | `Message` | Direct messages |
| HK_ Message Streak | `MessageStreak` | Daily message streaks |
| HK_ Live Stream | `LiveStream` | Active/past live streams |
| HK_ Recording | `Recording` | Stream recordings |
| HK_ Editor Project | `EditorProject` | Saved editor projects |
| HK_ Live Participant | `LiveParticipant` | Stream viewers/participants |
| HK_ Live Chat | `LiveChatMessage` | Live stream chat messages |
| HK_ Moderator | `Moderator` | Stream moderators |
| HK_ Report | `Report` | Content/user reports |
| HK_ Service | `Service` | Marketplace service listings |
| HK_ Service Order | `ServiceOrder` | Service orders |
| HK_ Subscription | `Subscription` | User subscriptions |
| HK_ Ad Settings | `AdSettings` | Ad configuration |
| HK_ Custom Ad | `CustomAd` | Custom ad creatives |
| HK_ Ad Impression | `AdImpressionLog` | Ad impression tracking |
| HK_ Notification | `Notification` | User notifications |
| HK_ Bug Report | `BugReport` | Platform bug reports |
| HK_ Stream Whitelist | `StreamWhitelist` | Stream access whitelist |
| HK_ Power Up | `PowerUp` | Battle power-up purchases |
| HK_ Battle Invitation | `BattleInvitation` | Battle invites |

### HK_ FiveM Database Models

| HK_ Name | Model | What It Stores |
|---|---|---|
| HK_ FiveM Server | `FivemServer` | Registered FiveM servers — slug, name, apiKey, settings |
| HK_ FiveM Member | `FivemServerMember` | Server team members + roles |
| HK_ FiveM Job | `FivemServerJob` | Job definitions for server |
| HK_ FiveM Page | `FivemServerPage` | Custom server pages |
| HK_ FiveM VIP Package | `FivemServerVipPackage` | VIP tier definitions |
| HK_ FiveM VIP Purchase | `FivemServerVipPurchase` | VIP purchases |
| HK_ FiveM Subscription | `FivemWebsiteSubscription` | Server management subscriptions |
| HK_ FiveM Whitelist App | `FivemWhitelistApplication` | Whitelist applications |
| HK_ FiveM Bug | `FivemBugReport` | Player bug reports (AI-investigated) |
| HK_ FiveM Suggestion | `FivemSuggestion` | Player suggestions (AI-analyzed) |
| HK_ FiveM Comment | `FivemAdminComment` | Admin comments on bugs/suggestions |

### HK_ FiveM Raw Tables (created by server-db.ts, not in Prisma)

| Table | What It Stores |
|---|---|
| `FivemPendingCommand` | Queued commands for FiveM server (ENSURE, UPDATE) |
| `FivemServerLog` | Server log entries |
| `FivemPlayerReport` | In-game player reports |

---

## HK_ FiveM Resources (fivem/hkc/resources/)

### [hk] — Core Game Systems

| HK_ Name | Resource | What It Does |
|---|---|---|
| HK_ Debug | `HK-debug` | Bug reports, suggestions, server management, pending command polling |
| HK_ Core | `hkcore` | Characters, accounts, money, appearance, spawn |
| HK_ Economy | `hkeconomy` | Shops, crafting, contraband, marked funds, crypto |
| HK_ Inventory | `hkinventory` | Item inventory, death bags, item use |
| HK_ Fuel | `hkfuel` | Vehicle fuel, gas stations, gas cans |
| HK_ Garage | `hkgarage` | Vehicle storage, impound, spawn vehicles |
| HK_ Hospital | `hkhospital` | Death, injuries, respawn, hospital |
| HK_ Housing | `hkhousing` | Property ownership, stash storage |
| HK_ Insurance | `hkinsurance` | Vehicle insurance, firearms certificates |
| HK_ Jobs | `hkjobs` | Job center, duty toggle, boss menu, taxi meter |
| HK_ Licence | `hklicence` | DVLA — theory tests, practical tests, licence cards |
| HK_ Police | `hkpolice` | MDT, dispatch, arrests, warrants, evidence |
| HK_ Gangs | `hkgangs` | Gang territories, gang chat |
| HK_ Needs | `hkneeds` | Hunger, thirst, stamina HUD |
| HK_ Drift | `hkdrift` | Drift mode toggle |
| HK_ NOS | `hknos` | Vehicle nitrous system |
| HK_ PVP | `hkc_pvp` | PVP kill tracking and zones |
| HK_ Trucker Job | `hkc_truckerjob` | Delivery/haulage job |
| HK_ Uber Mission | `hkc_ubermission` | Private hire taxi job |
| HK_ Prologue | `hk-prologuemission` | New-player plane fly-in |
| HK_ Lost MC | `hklostmc` | Lost MC clubhouse, faction check |

### [Police Skins] — Police Character Models

| Resource | What It Is |
|---|---|
| `hkc_police_detective` | Detective skin |
| `hkc_police_ems` | EMS skin |
| `hkc_police_hway` | Highway patrol skin |
| `hkc_police_ped` | Police ped skin |
| `hkc_police_sheriff` | Sheriff skin |
| `hkc_police_sheriffd` | Sheriff department skin |
| `hkc_police_swat` | SWAT skin |

---

## HK_ Tools (tools/)

| HK_ Name | Path | What It Does |
|---|---|---|
| HK_ Claude Bridge | `tools/claude-bridge/` | Desktop automation — send keystrokes, window management |
| HK_ Watchdog | `tools/claude-bridge/watchdog.js` | Monitor and restart bridge processes |
| HK_ Window Scanner | `tools/claude-bridge/window-scanner.py` | Enumerate desktop windows |
| HK_ Cloudflare Tunnel | `tools/cloudflare/` | Cloudflared tunnel setup |
| HK_ Device Admin | `tools/device-admin/` | Device approval tool |
| HK_ RTMP Server | `tools/rtmp-server/server.js` | Local RTMP ingest server |
| HK_ Ensure HKDebug | `tools/ensure-hkdebug.js` | Ensure HK-debug resource is loaded |
| HK_ Scripts | `tools/scripts/` | Maintenance scripts (video audit, tag, thumbnail, ledger) |

---

## HK_ Public Assets

| File | What It Is |
|---|---|
| `public/sw.js` | Service worker (caching, offline) |
| `public/manifest.json` | PWA manifest |
| `public/logo.png` | App logo |
| `public/logo-wide.png` | Wide logo variant |
| `public/icons/` | PWA icons (192, 512, apple-touch) |
| `public/sounds/notification.mp3` | Notification sound |
| `public/fivem/hkc-logo.svg` | FiveM server logo |

---

## HK_ Config Files

| File | What It Does |
|---|---|
| `package.json` | Dependencies + scripts |
| `next.config.ts` | Next.js configuration |
| `tsconfig.json` | TypeScript configuration |
| `eslint.config.mjs` | ESLint rules |
| `postcss.config.mjs` | PostCSS (Tailwind) |
| `prisma/schema.prisma` | Database schema |
| `prisma/seed.ts` | Database seed data |
| `.env` | Environment variables |
| `.gitignore` | Git ignore rules |

---

## HK_ Tests

| File | What It Tests |
|---|---|
| `tests/rate-limit.test.ts` | Rate limiter logic |
| `tests/security-policy.test.ts` | Security policy rules |
| `tests/run-tests.ts` | Test runner |

---

## HK_ Hooks

| File | What It Does |
|---|---|
| `src/hooks/useImaAds.ts` | Google IMA ad integration |
| `src/hooks/useStreamlabs.ts` | Streamlabs integration |

---

## HK_ AI Bug/Suggestion Pipeline

**Status Flow — Bugs:**
```
OPEN → INVESTIGATING → DIAGNOSED → FIXING → FIXED → TESTING → RESOLVED
                    ↘ CANT_FIND      ↘ FAILED (retry)
```

**Status Flow — Suggestions:**
```
NEW → ANALYZING → ANALYZED → CONSIDERING → PLANNED → IMPLEMENTING → IMPLEMENTED → ADDED
               ↘ CANT_ANALYZE                     ↘ FAILED (retry)        ↘ DECLINED
```

**How It Works:**
1. Player submits bug/suggestion via in-game NUI (HK-debug resource)
2. Admin sees it on Rally Live dashboard
3. Admin clicks "Investigate" / "Analyze" → spawns Claude CLI as subprocess
4. Claude searches the FiveM workspace (`fivem/{slug}/resources/`)
5. Claude posts result back to `/claude-response` callback route
6. Result saved to database, status updated
7. Admin reviews → clicks "Fix" / "Implement" → Claude edits code
8. Admin clicks "Deploy" → queues pending command → HK-debug polls and runs `ensure`
