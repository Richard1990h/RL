// ─── Platforms ────────────────────────────────────────────────────────────────

export type Platform = 'fiverr' | 'upwork';

export type GigType = 'blog' | 'logo' | 'website' | 'seo' | 'caption' | 'social';

export type OrderStatus =
  | 'new'
  | 'in_progress'
  | 'qa'
  | 'review'
  | 'approved'
  | 'delivered'
  | 'revision'
  | 'dispute'
  | 'cancelled';

export type OperationMode = 'supervised' | 'autonomous';

// ─── Domain objects ───────────────────────────────────────────────────────────

export interface Order {
  id: string;
  platform: Platform;
  gig_type: GigType;
  buyer_name: string;
  buyer_username: string;
  brief: string;
  brief_json: string | null;
  price_gbp: number;
  deadline_at: string | null;
  status: OrderStatus;
  revision_count: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  platform: Platform;
  order_id: string | null;
  direction: 'inbound' | 'outbound';
  sender: string;
  body: string;
  sent_at: string;
  replied: number;
}

export interface Deliverable {
  id: string;
  order_id: string;
  file_path: string;
  file_type: 'text' | 'image' | 'zip' | 'pdf';
  version: number;
  is_final: number;
  created_at: string;
}

export interface Draft {
  id: string;
  order_id: string;
  content: string;
  model_used: string;
  version: number;
  created_at: string;
}

export interface QaScore {
  id: string;
  order_id: string;
  draft_id: string;
  pass_number: number;
  score: number;
  feedback: string;
  passed: number;
  scored_at: string;
}

export interface LedgerEntry {
  id: string;
  order_id: string | null;
  type: 'income' | 'refund' | 'withdrawal' | 'fee';
  amount_gbp: number;
  description: string;
  recorded_at: string;
}

export interface ClaudeUsage {
  id: string;
  order_id: string | null;
  purpose: string;
  input_tokens: number;
  output_tokens: number;
  used_at: string;
}

// ─── Queue job payloads ───────────────────────────────────────────────────────

export interface PollInboxPayload {
  platform: Platform;
}

export interface ProcessOrderPayload {
  order_id: string;
}

export interface QaJobPayload {
  order_id: string;
  draft_id: string;
  attempt: number;
}

export interface DeliverJobPayload {
  order_id: string;
  deliverable_id: string;
}

export interface WithdrawalCheckPayload {
  platform: Platform;
}

export interface DailyReportPayload {
  date: string;
}

export type JobPayload =
  | PollInboxPayload
  | ProcessOrderPayload
  | QaJobPayload
  | DeliverJobPayload
  | WithdrawalCheckPayload
  | DailyReportPayload
  | Record<string, unknown>;

// ─── LLM ─────────────────────────────────────────────────────────────────────

export type LlmRole = 'text' | 'vision' | 'code' | 'fallback';

export interface LlmRequest {
  role: LlmRole;
  prompt: string;
  systemPrompt?: string;
  imageBase64?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}

// ─── Vision / Desktop ─────────────────────────────────────────────────────────

export interface ScreenState {
  screenshotBase64: string;
  url?: string;
  pageTitle?: string;
  timestamp: string;
}

export interface ParsedUiState {
  hasNewOrders: boolean;
  hasNewMessages: boolean;
  orders: ParsedOrder[];
  messages: ParsedMessage[];
  anomalies: string[];
}

export interface ParsedOrder {
  id: string;
  buyer: string;
  brief: string;
  price: string;
  deadline: string;
  gigType: GigType;
}

export interface ParsedMessage {
  id: string;
  sender: string;
  preview: string;
  isUnread: boolean;
}

// ─── QA ──────────────────────────────────────────────────────────────────────

export interface QaResult {
  score: number;      // 1-10
  feedback: string;
  passed: boolean;    // score >= MIN_QA_SCORE
  passNumber: number;
}

// ─── Treasury ────────────────────────────────────────────────────────────────

export interface TreasurySnapshot {
  totalIncomeGbp: number;
  totalRefundsGbp: number;
  totalWithdrawalsGbp: number;
  totalFeesGbp: number;
  balanceGbp: number;
  pendingGbp: number;
  monthToDateGbp: number;
  todayGbp: number;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export interface HealthReport {
  healthy: boolean;
  gpuTempC: number | null;
  gpuVramUsedMb: number | null;
  ollamaOnline: boolean;
  comfyOnline: boolean;
  redisOnline: boolean;
  dbOnline: boolean;
  queueDepth: number;
  claudeCallsToday: number;
  uptimeSeconds: number;
  issues: string[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface AppConfig {
  anthropicApiKey: string;
  ollamaHost: string;
  ollamaTextModel: string;
  ollamaVisionModel: string;
  ollamaCodeModel: string;
  ollamaFallbackModel: string;
  comfyHost: string;
  redisHost: string;
  redisPort: number;
  redisPassword: string;
  discordBotToken: string;
  discordChannelId: string;
  discordGuildId: string;
  fiverrEmail: string;
  fiverrPassword: string;
  fiverrUsername: string;
  supervisedMode: boolean;
  maxClaudeCallsPerDay: number;
  workHoursStart: number;
  workHoursEnd: number;
  timezone: string;
  pollIntervalMinSecs: number;
  pollIntervalMaxSecs: number;
  gpuTempAlertC: number;
  minQaScore: number;
  maxRegenAttempts: number;
  autoRefundLimitGbp: number;
}
