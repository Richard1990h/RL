/**
 * qa.ts
 * Two-pass local QA — scores every draft 1-10 against the order brief.
 * Pass 1: check completeness and accuracy.
 * Pass 2: check tone, quality, and client-readiness.
 * If score < MIN_QA_SCORE after MAX_REGEN_ATTEMPTS, escalates to Claude review.
 */
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { generate } from './local_llm.js';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { dbRun } from '../db/db.js';
import type { Order, Draft, QaResult } from '../types/index.js';

const MOD = 'qa';

// ─── QA prompt builders ────────────────────────────────────────────────────────

function pass1Prompt(brief: string, content: string, gigType: string): string {
  return `You are a quality-assurance agent for a freelance agency.

ORDER BRIEF:
${brief}

GIG TYPE: ${gigType}

DELIVERABLE CONTENT:
${content.slice(0, 4000)}

PASS 1 — COMPLETENESS & ACCURACY CHECK
Score this deliverable on a scale of 1-10 based on:
- Does it fully address what the buyer asked for?
- Is it the right format/type for the gig?
- Is it complete (not truncated or missing sections)?
- Are there factual errors or obvious mistakes?

Return ONLY valid JSON:
{
  "score": <integer 1-10>,
  "feedback": "<specific, actionable feedback in 2-3 sentences>",
  "issues": ["<issue 1>", "<issue 2>"]
}`;
}

function pass2Prompt(brief: string, content: string, gigType: string): string {
  return `You are a quality-assurance agent for a freelance agency.

ORDER BRIEF:
${brief}

GIG TYPE: ${gigType}

DELIVERABLE CONTENT:
${content.slice(0, 4000)}

PASS 2 — QUALITY & CLIENT-READINESS CHECK
Score this deliverable on a scale of 1-10 based on:
- Is the writing/output professional and polished?
- Would a real paying client be satisfied?
- Is the tone appropriate for the brief?
- Is it free from AI "tells" (repetitive phrases, hollow filler, excessive hedging)?
- Does it deliver genuine value?

Return ONLY valid JSON:
{
  "score": <integer 1-10>,
  "feedback": "<specific, actionable feedback in 2-3 sentences>",
  "suggestions": ["<improvement 1>", "<improvement 2>"]
}`;
}

// ─── Parse score JSON from model output ───────────────────────────────────────

function parseScore(raw: string): { score: number; feedback: string } {
  try {
    const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const score = Math.min(10, Math.max(1, parseInt(String(parsed.score))));
    return { score, feedback: parsed.feedback ?? '' };
  } catch {
    // Fallback: try to find a number in the text
    const match = raw.match(/\b([1-9]|10)\b/);
    return {
      score: match ? parseInt(match[1]) : 5,
      feedback: 'QA model returned unparseable output — manual review recommended.',
    };
  }
}

// ─── Load deliverable content ─────────────────────────────────────────────────

function loadContent(draft: Draft): string {
  // draft.content may be a file path or inline text
  if (draft.content.startsWith('/') && fs.existsSync(draft.content)) {
    return fs.readFileSync(draft.content, 'utf-8');
  }
  return draft.content;
}

// ─── Single QA pass ───────────────────────────────────────────────────────────

async function runPass(passNum: 1 | 2, order: Order, draft: Draft): Promise<QaResult> {
  const cfg = getConfig();
  const content = loadContent(draft);
  const prompt = passNum === 1
    ? pass1Prompt(order.brief, content, order.gig_type)
    : pass2Prompt(order.brief, content, order.gig_type);

  const res = await generate({
    role: 'text',
    prompt,
    temperature: 0.2,
    maxTokens: 512,
  });

  const { score, feedback } = parseScore(res.text);
  const passed = score >= cfg.minQaScore;

  const scoreId = uuidv4();
  dbRun(
    `INSERT INTO qa_scores (id, order_id, draft_id, pass_number, score, feedback, passed)
     VALUES (?,?,?,?,?,?,?)`,
    [scoreId, order.id, draft.id, passNum, score, feedback, passed ? 1 : 0]
  );

  logger.info(MOD, `Pass ${passNum} score: ${score}/10 — ${passed ? 'PASS' : 'FAIL'}`, {
    orderId: order.id, feedback: feedback.slice(0, 100),
  });

  return { score, feedback, passed, passNumber: passNum };
}

// ─── Full two-pass QA ─────────────────────────────────────────────────────────

export async function runQa(order: Order, draft: Draft): Promise<{ pass1: QaResult; pass2: QaResult; overall: boolean }> {
  const pass1 = await runPass(1, order, draft);
  const pass2 = await runPass(2, order, draft);

  const avgScore = (pass1.score + pass2.score) / 2;
  const overall = pass1.passed && pass2.passed;

  logger.info(MOD, `QA complete — avg ${avgScore.toFixed(1)}/10 — ${overall ? 'PASSED' : 'FAILED'}`, {
    orderId: order.id,
  });

  return { pass1, pass2, overall };
}

// ─── Regeneration loop ────────────────────────────────────────────────────────

export async function qaWithRegeneration(
  order: Order,
  drafts: Draft[],
  producer: (attempt: number) => Promise<Draft>
): Promise<{ finalDraft: Draft; passed: boolean; attempts: number }> {
  const cfg = getConfig();
  let lastDraft = drafts[0];
  let lastResult: { overall: boolean } = { overall: false };
  let attempt = 0;

  while (attempt < cfg.maxRegenAttempts) {
    attempt++;

    if (attempt > 1) {
      logger.info(MOD, `Regenerating (attempt ${attempt}/${cfg.maxRegenAttempts})`, { orderId: order.id });
      lastDraft = await producer(attempt);
    }

    const result = await runQa(order, lastDraft);
    lastResult = result;

    if (result.overall) {
      return { finalDraft: lastDraft, passed: true, attempts: attempt };
    }

    logger.warn(MOD, `QA failed — will regenerate`, {
      orderId: order.id, attempt,
      p1: result.pass1.score, p2: result.pass2.score,
    });
  }

  logger.warn(MOD, `All ${cfg.maxRegenAttempts} regen attempts exhausted — escalating to Claude`, { orderId: order.id });
  return { finalDraft: lastDraft, passed: false, attempts: attempt };
}
