import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { generateCode } from '../../core/local_llm.js';
import { logger } from '../../core/logger.js';
import { getConfig } from '../../core/config.js';
import { dbRun } from '../../db/db.js';
import type { Order } from '../../types/index.js';

const MOD = 'producer:website';

const WEBSITE_SYSTEM_PROMPT = `You are an expert front-end developer delivering a complete, production-ready single-page website for a paying client.

Requirements:
- Output a single complete HTML file — nothing else, no markdown fences, no commentary
- Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- The page must be fully responsive (mobile-first)
- Include: a sticky navigation bar, a hero section, at least 3 content sections, a footer
- Use semantic HTML5 elements (header, nav, main, section, footer)
- Include smooth scroll behaviour and hover transitions
- The colour scheme and content should match the client brief
- All placeholder copy must be plausible and relevant to the brief — no Lorem Ipsum
- Include a contact section with a simple HTML form (name, email, message, submit button)
- Do NOT use external fonts, icons, or images that require network requests beyond the Tailwind CDN
- Output ONLY the raw HTML — starting with <!DOCTYPE html> and ending with </html>`;

export async function produceWebsite(order: Order): Promise<string> {
  logger.info(MOD, `Starting website production for order ${order.id}`, {
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
  const fileName = `website-v${version}.html`;
  const filePath = path.join(deliverDir, fileName);

  logger.info(MOD, `Generating website HTML via code LLM`, { orderId: order.id });

  let htmlContent: string;
  try {
    htmlContent = await generateCode(
      `Create a complete single-page HTML website with Tailwind CSS CDN for this client brief:\n\n${order.brief}\n\nOutput only the raw HTML file, starting with <!DOCTYPE html>.`,
      WEBSITE_SYSTEM_PROMPT,
    );
  } catch (err) {
    throw new Error(`LLM code generation failed for website order ${order.id}: ${(err as Error).message}`);
  }

  // Strip any markdown code fences the model may have added despite instructions
  htmlContent = htmlContent
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  if (!htmlContent.toLowerCase().includes('<!doctype html')) {
    throw new Error(`LLM did not return valid HTML for website order ${order.id}`);
  }

  try {
    fs.writeFileSync(filePath, htmlContent, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to write website file ${filePath}: ${(err as Error).message}`);
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

  logger.info(MOD, `Website HTML written`, { orderId: order.id, filePath, chars: htmlContent.length });
  return filePath;
}
