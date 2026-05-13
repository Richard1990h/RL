import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { generateText } from '../../core/local_llm.js';
import { logger } from '../../core/logger.js';
import { getConfig } from '../../core/config.js';
import { dbRun } from '../../db/db.js';
import type { Order } from '../../types/index.js';

const MOD = 'producer:blog';

const BLOG_SYSTEM_PROMPT = `You are an expert freelance content writer producing a high-quality blog post for a paying client.

Requirements:
- Write a complete, polished blog post of approximately 1500 words
- Use an engaging headline (H1) followed by an introduction
- Structure with clear H2 subheadings (at least 4 sections)
- Each section should be detailed, informative, and well-researched in tone
- Include a compelling conclusion with a call-to-action
- Write in a professional yet approachable tone
- Optimise naturally for SEO without keyword stuffing
- Do NOT include any meta commentary, preamble, or notes — output only the blog post content itself`;

export async function produceBlog(order: Order): Promise<string> {
  logger.info(MOD, `Starting blog production for order ${order.id}`, {
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
  const fileName = `blog-v${version}.txt`;
  const filePath = path.join(deliverDir, fileName);

  logger.info(MOD, `Generating blog post via LLM`, { orderId: order.id });

  let blogContent: string;
  try {
    blogContent = await generateText(
      `Write a detailed 1500-word blog post based on this client brief:\n\n${order.brief}`,
      BLOG_SYSTEM_PROMPT,
    );
  } catch (err) {
    throw new Error(`LLM generation failed for blog order ${order.id}: ${(err as Error).message}`);
  }

  if (!blogContent || blogContent.trim().length < 200) {
    throw new Error(`LLM returned insufficient content for blog order ${order.id} (got ${blogContent?.length ?? 0} chars)`);
  }

  try {
    fs.writeFileSync(filePath, blogContent, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to write blog file ${filePath}: ${(err as Error).message}`);
  }

  // Persist deliverable record in DB
  try {
    dbRun(
      `INSERT OR IGNORE INTO deliverables (id, order_id, file_path, file_type, version, is_final, created_at)
       VALUES (?, ?, ?, 'text', 1, 0, datetime('now'))`,
      [version, order.id, filePath],
    );
  } catch (err) {
    // Non-fatal — file is written; log and continue
    logger.warn(MOD, `DB insert failed for deliverable`, { orderId: order.id, err: (err as Error).message });
  }

  logger.info(MOD, `Blog post written`, { orderId: order.id, filePath, chars: blogContent.length });
  return filePath;
}
