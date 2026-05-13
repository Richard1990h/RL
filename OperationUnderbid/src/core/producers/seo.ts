import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { generateText } from '../../core/local_llm.js';
import { logger } from '../../core/logger.js';
import { getConfig } from '../../core/config.js';
import { dbRun } from '../../db/db.js';
import type { Order } from '../../types/index.js';

const MOD = 'producer:seo';

const SEO_SYSTEM_PROMPT = `You are a senior SEO strategist and content writer. Produce a complete SEO deliverable.

Your output MUST follow this EXACT format with these exact section labels on their own lines:

META TITLE:
(Write the meta title here — maximum 60 characters)

META DESCRIPTION:
(Write the meta description here — maximum 160 characters)

FOCUS KEYWORDS:
1. (keyword one)
2. (keyword two)
3. (keyword three)
4. (keyword four)
5. (keyword five)

SEO ARTICLE:
(Write the full 800-word SEO article here with H1, H2 subheadings, and a natural keyword distribution)

Rules:
- Meta title: under 60 characters, includes primary keyword, compelling
- Meta description: under 160 characters, includes call-to-action, no truncation
- Keywords: a mix of short-tail and long-tail phrases relevant to the topic
- SEO article: ~800 words, H1 at top, at least 3 H2 sections, keywords used naturally, ends with a conclusion
- Do NOT add any extra commentary, preamble, or notes outside the format above`;

export async function produceSeo(order: Order): Promise<string> {
  logger.info(MOD, `Starting SEO package production for order ${order.id}`, {
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
  const fileName = `seo-v${version}.txt`;
  const filePath = path.join(deliverDir, fileName);

  logger.info(MOD, `Generating SEO package via LLM`, { orderId: order.id });

  let rawContent: string;
  try {
    rawContent = await generateText(
      `Produce a full SEO package for the following client brief:\n\n${order.brief}`,
      SEO_SYSTEM_PROMPT,
    );
  } catch (err) {
    throw new Error(`LLM generation failed for SEO order ${order.id}: ${(err as Error).message}`);
  }

  if (!rawContent || rawContent.trim().length < 300) {
    throw new Error(`LLM returned insufficient content for SEO order ${order.id} (got ${rawContent?.length ?? 0} chars)`);
  }

  // Validate that required sections are present; warn if missing
  const requiredSections = ['META TITLE:', 'META DESCRIPTION:', 'FOCUS KEYWORDS:', 'SEO ARTICLE:'];
  for (const section of requiredSections) {
    if (!rawContent.includes(section)) {
      logger.warn(MOD, `SEO output missing expected section: ${section}`, { orderId: order.id });
    }
  }

  // Enforce meta title ≤60 chars and meta description ≤160 chars (trim if needed)
  const content = enforceSeoLimits(rawContent);

  try {
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to write SEO file ${filePath}: ${(err as Error).message}`);
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

  logger.info(MOD, `SEO package written`, { orderId: order.id, filePath, chars: content.length });
  return filePath;
}

// ─── Post-processing helpers ──────────────────────────────────────────────────

function enforceSeoLimits(raw: string): string {
  let result = raw;

  // Trim meta title if it exceeds 60 chars
  result = result.replace(/META TITLE:\s*\n(.+)/i, (_match, title: string) => {
    const trimmed = title.trim().slice(0, 60);
    return `META TITLE:\n${trimmed}`;
  });

  // Trim meta description if it exceeds 160 chars
  result = result.replace(/META DESCRIPTION:\s*\n(.+)/i, (_match, desc: string) => {
    const trimmed = desc.trim().slice(0, 160);
    return `META DESCRIPTION:\n${trimmed}`;
  });

  return result;
}
