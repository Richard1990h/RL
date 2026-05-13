import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { generateText } from '../../core/local_llm.js';
import { logger } from '../../core/logger.js';
import { getConfig } from '../../core/config.js';
import { dbRun } from '../../db/db.js';
import type { Order } from '../../types/index.js';

const MOD = 'producer:caption';

const CAPTION_SYSTEM_PROMPT = `You are a professional subtitle writer creating SRT-format captions for a video.

Your output MUST be a valid SRT subtitle file with exactly 15 subtitle entries.

SRT format rules:
- Each entry has: a sequential number, then a timecode line, then the subtitle text, then a blank line
- Timecode format: HH:MM:SS,mmm --> HH:MM:SS,mmm  (e.g. 00:00:02,500 --> 00:00:05,000)
- Each subtitle should last 2–4 seconds
- Text should be natural-sounding speech, 1–2 lines max, under 42 characters per line
- Subtitles must be realistic for the video described — not generic filler
- Start at 00:00:02,000 and space entries naturally throughout a ~2-minute video
- Output ONLY the raw SRT content — no markdown, no commentary, no code fences

Example entry:
1
00:00:02,000 --> 00:00:04,500
Welcome to our channel.

2
00:00:05,000 --> 00:00:08,000
Today we're covering something important.`;

export async function produceCaption(order: Order): Promise<string> {
  logger.info(MOD, `Starting caption/subtitle production for order ${order.id}`, {
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
  const fileName = `captions-v${version}.srt`;
  const filePath = path.join(deliverDir, fileName);

  logger.info(MOD, `Generating SRT captions via LLM`, { orderId: order.id });

  let srtContent: string;
  try {
    srtContent = await generateText(
      `Create a 15-entry SRT subtitle file for a video described as follows:\n\n${order.brief}\n\nOutput only the raw SRT content.`,
      CAPTION_SYSTEM_PROMPT,
    );
  } catch (err) {
    throw new Error(`LLM generation failed for caption order ${order.id}: ${(err as Error).message}`);
  }

  if (!srtContent || srtContent.trim().length < 100) {
    throw new Error(`LLM returned insufficient content for caption order ${order.id} (got ${srtContent?.length ?? 0} chars)`);
  }

  // Strip any markdown code fences
  srtContent = srtContent
    .replace(/^```(?:srt)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // Validate it looks like SRT: must contain at least one timecode arrow
  if (!srtContent.includes('-->')) {
    logger.warn(MOD, `SRT output may be malformed — no timecode arrows found`, { orderId: order.id });
    // Attempt to recover by generating a fallback SRT from the raw text
    srtContent = buildFallbackSrt(order.brief, srtContent);
  }

  try {
    fs.writeFileSync(filePath, srtContent, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to write caption file ${filePath}: ${(err as Error).message}`);
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

  logger.info(MOD, `SRT captions written`, { orderId: order.id, filePath });
  return filePath;
}

// ─── Fallback SRT builder ─────────────────────────────────────────────────────

/**
 * If the LLM returns prose instead of SRT, split it into sentences and
 * lay them out as a 15-entry SRT covering ~2 minutes.
 */
function buildFallbackSrt(brief: string, rawText: string): string {
  // Extract up to 15 sentences from raw text (or brief as last resort)
  const source = rawText.length > 50 ? rawText : brief;
  const sentences = source
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5)
    .slice(0, 15);

  // Pad to exactly 15
  while (sentences.length < 15) {
    sentences.push(`Part ${sentences.length + 1} of the video continues here.`);
  }

  const entries: string[] = [];
  let currentSec = 2; // start at 00:00:02

  for (let i = 0; i < 15; i++) {
    const startSec = currentSec;
    // Duration based on rough reading speed (~150 wpm → 2.5 chars/sec per word)
    const words = sentences[i].split(' ').length;
    const durationSec = Math.min(Math.max(Math.ceil(words / 2.5), 2), 5);
    const endSec = startSec + durationSec;

    entries.push(
      `${i + 1}\n${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}\n${truncateSrtLine(sentences[i])}`,
    );

    currentSec = endSec + 1;
  }

  return entries.join('\n\n') + '\n';
}

function formatSrtTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},000`;
}

function truncateSrtLine(text: string): string {
  if (text.length <= 84) return text; // 2 lines of 42 chars
  // Split into two lines
  const mid = Math.floor(text.length / 2);
  const breakAt = text.lastIndexOf(' ', mid);
  if (breakAt < 0) return text.slice(0, 84);
  return text.slice(0, breakAt) + '\n' + text.slice(breakAt + 1, breakAt + 43);
}
