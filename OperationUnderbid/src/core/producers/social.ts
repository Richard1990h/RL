import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { generateText } from '../../core/local_llm.js';
import { logger } from '../../core/logger.js';
import { getConfig } from '../../core/config.js';
import { dbRun } from '../../db/db.js';
import type { Order } from '../../types/index.js';

const MOD = 'producer:social';

const SOCIAL_SYSTEM_PROMPT = `You are an expert social media copywriter creating platform-specific posts for a paying client.

Your output MUST follow this EXACT format with these exact section labels on their own lines:

TWITTER/X:
(Write the Twitter/X post here — maximum 280 characters, punchy and engaging, include relevant hashtags)

INSTAGRAM:
(Write the Instagram caption here — engaging, storytelling tone, 150–300 words, include a call-to-action and 10–15 relevant hashtags at the end)

LINKEDIN:
(Write the LinkedIn post here — professional tone, 150–300 words, thought-leadership angle, minimal hashtags 3–5)

FACEBOOK:
(Write the Facebook post here — conversational and community-focused, 100–200 words, encourage engagement with a question or prompt)

TIKTOK:
(Write the TikTok caption here — maximum 150 characters, energetic and trendy, 3–5 hashtags, hook-first)

Rules:
- Each post must be tailored to the platform's culture and character limits
- All posts must relate directly to the client brief — no generic filler
- Hashtags must be relevant and specific, not generic like #love or #follow
- Do NOT include any extra commentary, preamble, notes, or markdown formatting outside the section labels above
- Output ONLY the five sections in the exact order and with the exact labels shown`;

// Per-platform character limits for validation
const PLATFORM_LIMITS: Record<string, number> = {
  'TWITTER/X': 280,
  'TIKTOK': 150,
};

export async function produceSocial(order: Order): Promise<string> {
  logger.info(MOD, `Starting social media content production for order ${order.id}`, {
    buyer: order.buyer_name,
    briefLen: order.brief.length,
  });

  const deliverDir = path.resolve(process.cwd(), 'deliverables', order.id);
  try {
    fs.mkdirSync(deliverDir, { recursive: true });
  } catch (err) {
    throw new Error(`Failed to create deliverable directory ${deliverDir}: ${(err as Error).message}`);
  }

  const version = uuidv4();
  const fileName = `social-v${version}.txt`;
  const filePath = path.join(deliverDir, fileName);

  logger.info(MOD, `Generating social media posts via LLM`, { orderId: order.id });

  let rawContent: string;
  try {
    rawContent = await generateText(
      `Create 5 platform-specific social media posts for the following client brief:\n\n${order.brief}\n\nProduce posts for: Twitter/X, Instagram, LinkedIn, Facebook, and TikTok. Follow the format exactly.`,
      SOCIAL_SYSTEM_PROMPT,
    );
  } catch (err) {
    throw new Error(`LLM generation failed for social order ${order.id}: ${(err as Error).message}`);
  }

  if (!rawContent || rawContent.trim().length < 200) {
    throw new Error(`LLM returned insufficient content for social order ${order.id} (got ${rawContent?.length ?? 0} chars)`);
  }

  // Validate required platform sections are present
  const requiredSections = ['TWITTER/X:', 'INSTAGRAM:', 'LINKEDIN:', 'FACEBOOK:', 'TIKTOK:'];
  const missingSections: string[] = [];
  for (const section of requiredSections) {
    if (!rawContent.includes(section)) {
      missingSections.push(section);
      logger.warn(MOD, `Social output missing expected section: ${section}`, { orderId: order.id });
    }
  }

  // Post-process: enforce hard character limits on Twitter/X and TikTok
  const content = enforceCharLimits(rawContent);

  // Append a summary note if sections were missing
  let finalContent = content;
  if (missingSections.length > 0) {
    finalContent += `\n\n--- NOTE: The following sections may be missing or malformed: ${missingSections.join(', ')} ---\n`;
    logger.warn(MOD, `Social deliverable has missing sections`, {
      orderId: order.id,
      missing: missingSections,
    });
  }

  try {
    fs.writeFileSync(filePath, finalContent, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to write social file ${filePath}: ${(err as Error).message}`);
  }

  // Persist deliverable record
  try {
    dbRun(
      `INSERT OR IGNORE INTO deliverables (id, order_id, file_path, file_type, version, is_final, created_at)
       VALUES (?, ?, ?, 'text', 1, 0, datetime('now'))`,
      [version, order.id, filePath],
    );
  } catch (err) {
    logger.warn(MOD, `DB insert failed for deliverable`, { orderId: order.id, err: (err as Error).message });
  }

  logger.info(MOD, `Social media posts written`, {
    orderId: order.id,
    filePath,
    chars: finalContent.length,
    missingSections: missingSections.length,
  });

  return filePath;
}

// ─── Post-processing helpers ──────────────────────────────────────────────────

/**
 * Enforces per-platform character limits for platforms with strict caps.
 * Trims the first line of content after a label if it exceeds the limit.
 */
function enforceCharLimits(raw: string): string {
  let result = raw;

  for (const [platform, limit] of Object.entries(PLATFORM_LIMITS)) {
    // Match the section label and the immediately following non-empty line(s)
    const pattern = new RegExp(
      `(${escapeRegex(platform)}:\\s*\\n)([^\\n]+)`,
      'i',
    );
    result = result.replace(pattern, (_match, label: string, body: string) => {
      if (body.trim().length > limit) {
        const trimmed = body.trim().slice(0, limit - 1).trimEnd();
        logger.warn(MOD, `Trimmed ${platform} post to ${limit} chars (was ${body.trim().length})`);
        return `${label}${trimmed}`;
      }
      return `${label}${body}`;
    });
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
