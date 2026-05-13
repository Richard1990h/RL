/**
 * claude_review.ts
 * Final sign-off gate — calls Claude (the subscription model) only when:
 *   1. Local QA failed all regeneration attempts, OR
 *   2. The order has flags requiring human-level reasoning.
 *
 * Hard cap: MAX_CLAUDE_CALLS_PER_DAY per day (default 30).
 * All usage tracked in the claude_usage table.
 */
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { dbRun, dbGet } from '../db/db.js';
import type { Order, Draft } from '../types/index.js';

const MOD = 'claude_review';
const MODEL = 'claude-sonnet-4-6';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: getConfig().anthropicApiKey });
  return _client;
}

// ─── Daily usage guard ────────────────────────────────────────────────────────

function todayCallCount(): number {
  const row = dbGet<{ n: number }>(
    `SELECT COUNT(*) as n FROM claude_usage WHERE date(used_at) = date('now')`
  );
  return row?.n ?? 0;
}

function recordUsage(orderId: string | null, purpose: string, input: number, output: number): void {
  dbRun(
    `INSERT INTO claude_usage (id, order_id, purpose, input_tokens, output_tokens)
     VALUES (?,?,?,?,?)`,
    [uuidv4(), orderId, purpose, input, output]
  );
}

export function claudeBudgetExhausted(): boolean {
  const used = todayCallCount();
  const limit = getConfig().maxClaudeCallsPerDay;
  if (used >= limit) {
    logger.warn(MOD, `Daily Claude budget exhausted (${used}/${limit} calls)`);
    return true;
  }
  return false;
}

// ─── Review a draft ───────────────────────────────────────────────────────────

export interface ReviewResult {
  approved: boolean;
  notes: string;
  rewrittenContent?: string;
}

export async function reviewDraft(order: Order, draft: Draft): Promise<ReviewResult> {
  if (claudeBudgetExhausted()) {
    return {
      approved: false,
      notes: 'Claude daily budget exhausted — manual review required.',
    };
  }

  const content = draft.content.startsWith('/') && fs.existsSync(draft.content)
    ? fs.readFileSync(draft.content, 'utf-8')
    : draft.content;

  const prompt = `You are the final quality reviewer for a freelance agency.

ORDER BRIEF (from buyer):
${order.brief}

GIG TYPE: ${order.gig_type}
BUYER: ${order.buyer_name}
PRICE: £${order.price_gbp}

DRAFT DELIVERABLE:
${content.slice(0, 6000)}

Review this deliverable. If it is good enough to deliver to the client, approve it.
If it needs minor fixes, rewrite and approve it.
If it is fundamentally wrong, reject it.

Return ONLY valid JSON:
{
  "approved": <true or false>,
  "notes": "<brief explanation of decision in 1-2 sentences>",
  "rewrittenContent": "<if you rewrote it, put the full rewrite here, otherwise null>"
}`;

  logger.info(MOD, `Sending draft to Claude for review`, { orderId: order.id });

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  recordUsage(
    order.id,
    'review',
    response.usage.input_tokens,
    response.usage.output_tokens
  );

  const raw = response.content.map(b => (b.type === 'text' ? b.text : '')).join('');

  try {
    const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const result: ReviewResult = {
      approved: Boolean(parsed.approved),
      notes: parsed.notes ?? '',
      rewrittenContent: parsed.rewrittenContent ?? undefined,
    };

    // Persist review
    dbRun(
      `INSERT INTO reviews (id, order_id, draft_id, approved, notes) VALUES (?,?,?,?,?)`,
      [uuidv4(), order.id, draft.id, result.approved ? 1 : 0, result.notes]
    );

    logger.info(MOD, `Claude review: ${result.approved ? 'APPROVED' : 'REJECTED'}`, {
      orderId: order.id, notes: result.notes,
    });

    return result;
  } catch {
    logger.error(MOD, 'Failed to parse Claude review response', { raw: raw.slice(0, 300) });
    return { approved: false, notes: 'Claude response unparseable — treating as reject.' };
  }
}

// ─── Draft a client reply via Claude ─────────────────────────────────────────

export async function draftClientReply(
  incomingMessage: string,
  context: string,
  purpose: string
): Promise<string | null> {
  if (claudeBudgetExhausted()) return null;

  const prompt = `You are a professional freelancer on Fiverr responding to a client.

CONTEXT: ${context}
PURPOSE: ${purpose}

CLIENT MESSAGE:
${incomingMessage}

Write a professional, warm, concise reply (2-4 sentences).
Do not use hollow filler phrases like "Certainly!" or "Absolutely!".
Be direct, helpful, and human.
Return ONLY the reply text — no JSON, no quotes.`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  recordUsage(null, purpose, response.usage.input_tokens, response.usage.output_tokens);

  return response.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
}

// ─── Clarifying question helper ────────────────────────────────────────────────

export async function draftClarifyingQuestion(order: Order): Promise<string | null> {
  if (claudeBudgetExhausted()) return null;

  const prompt = `A buyer placed an order with this brief:
"${order.brief}"

The brief is ambiguous. Draft ONE polite, specific clarifying question (1-2 sentences)
that would let us complete the work correctly. No greeting needed.
Return only the question text.`;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  recordUsage(order.id, 'clarify', response.usage.input_tokens, response.usage.output_tokens);

  return response.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
}

// ─── Edge-case handling ────────────────────────────────────────────────────────

export async function handleEdgeCase(description: string): Promise<string> {
  if (claudeBudgetExhausted()) return 'Budget exhausted — please review manually.';

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: `Operation Underbid encountered an edge case:\n\n${description}\n\nProvide a brief, actionable recommendation (2-4 sentences).` }],
  });

  recordUsage(null, 'edge_case', response.usage.input_tokens, response.usage.output_tokens);
  return response.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
}
