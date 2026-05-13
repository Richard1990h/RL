import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { describeScreen } from './local_llm.js';
import { logger } from './logger.js';
import { dbRun } from '../db/db.js';
import type { ParsedUiState, ParsedOrder, ParsedMessage, GigType } from '../types/index.js';

const MOD = 'vision';
const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'screenshots');

// ─── Save screenshot to disk + DB ─────────────────────────────────────────────

export function saveScreenshot(base64: string, label: string, jobId?: string, orderId?: string): string {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const filename = `${Date.now()}-${label.replace(/\s+/g, '_')}.png`;
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));

  const id = uuidv4();
  dbRun(
    `INSERT INTO screenshots (id, job_id, order_id, file_path, label) VALUES (?,?,?,?,?)`,
    [id, jobId ?? null, orderId ?? null, filePath, label]
  );

  return filePath;
}

// ─── Parse Fiverr inbox / orders screen ───────────────────────────────────────

const INBOX_PARSE_PROMPT = `
You are analysing a Fiverr browser screenshot.

Return ONLY valid JSON with this exact shape (no markdown, no explanation):
{
  "hasNewOrders": boolean,
  "hasNewMessages": boolean,
  "orders": [
    {
      "id": "<order number or empty string>",
      "buyer": "<buyer username>",
      "brief": "<brief description of what they want>",
      "price": "<price shown, e.g. $25>",
      "deadline": "<deadline or delivery time shown>",
      "gigType": "<one of: blog|logo|website|seo|caption|social>"
    }
  ],
  "messages": [
    {
      "id": "<message thread id or empty string>",
      "sender": "<sender username>",
      "preview": "<first 120 chars of message>",
      "isUnread": boolean
    }
  ],
  "anomalies": ["<any warnings, CAPTCHA, login prompts, or unusual UI states>"]
}

If you cannot determine a field, use an empty string or false. Never omit fields.
`.trim();

export async function parseInboxScreen(screenshotBase64: string): Promise<ParsedUiState> {
  logger.debug(MOD, 'Parsing inbox screen with vision model');

  let raw: string;
  try {
    raw = await describeScreen(screenshotBase64, INBOX_PARSE_PROMPT);
  } catch (err) {
    logger.error(MOD, 'Vision model failed to parse inbox', { err: (err as Error).message });
    return emptyState();
  }

  try {
    // Strip possible markdown fences
    const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return normaliseState(parsed);
  } catch {
    logger.warn(MOD, 'Failed to parse vision JSON response', { raw: raw.slice(0, 300) });
    return emptyState();
  }
}

function emptyState(): ParsedUiState {
  return { hasNewOrders: false, hasNewMessages: false, orders: [], messages: [], anomalies: [] };
}

function normaliseState(raw: Partial<ParsedUiState>): ParsedUiState {
  return {
    hasNewOrders:   Boolean(raw.hasNewOrders),
    hasNewMessages: Boolean(raw.hasNewMessages),
    orders:         (raw.orders ?? []).map(normaliseOrder),
    messages:       (raw.messages ?? []).map(normaliseMessage),
    anomalies:      Array.isArray(raw.anomalies) ? raw.anomalies.filter(Boolean) : [],
  };
}

function normaliseOrder(o: Partial<ParsedOrder>): ParsedOrder {
  const validTypes: GigType[] = ['blog', 'logo', 'website', 'seo', 'caption', 'social'];
  return {
    id:       o.id ?? '',
    buyer:    o.buyer ?? '',
    brief:    o.brief ?? '',
    price:    o.price ?? '$0',
    deadline: o.deadline ?? '',
    gigType:  validTypes.includes(o.gigType as GigType) ? (o.gigType as GigType) : 'blog',
  };
}

function normaliseMessage(m: Partial<ParsedMessage>): ParsedMessage {
  return {
    id:       m.id ?? '',
    sender:   m.sender ?? '',
    preview:  m.preview ?? '',
    isUnread: Boolean(m.isUnread),
  };
}

// ─── Detect specific page states ──────────────────────────────────────────────

export async function detectPageState(screenshotBase64: string): Promise<{
  isLogin: boolean;
  isCaptcha: boolean;
  isOrderPage: boolean;
  isInbox: boolean;
  isDeliveryConfirm: boolean;
  isError: boolean;
}> {
  const answer = await describeScreen(
    screenshotBase64,
    `Look at this browser screenshot and return ONLY valid JSON:
{
  "isLogin": <true if this is a login page>,
  "isCaptcha": <true if a CAPTCHA or bot check is visible>,
  "isOrderPage": <true if this shows an order details page>,
  "isInbox": <true if this shows the Fiverr inbox or orders list>,
  "isDeliveryConfirm": <true if delivery was just confirmed>,
  "isError": <true if there is an error modal or warning banner>
}
Return only JSON. No markdown.`
  );

  try {
    const cleaned = answer.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { isLogin: false, isCaptcha: false, isOrderPage: false, isInbox: false, isDeliveryConfirm: false, isError: false };
  }
}

// ─── Confirm delivery uploaded ────────────────────────────────────────────────

export async function confirmDeliveryUpload(screenshotBase64: string): Promise<boolean> {
  const answer = await describeScreen(
    screenshotBase64,
    'Has a file been successfully uploaded and confirmed for delivery on this Fiverr page? Answer only "yes" or "no".'
  );
  return answer.toLowerCase().includes('yes');
}
