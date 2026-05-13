/**
 * smoke-tests.ts
 * Runs end-to-end module smoke tests.
 * Each test must pass before the orchestrator is considered ready.
 * Run with: npx tsx src/smoke-tests.ts
 */
import { getDb } from './db/db.js';
import { enqueue, getMainQueue, closeQueues } from './core/queue.js';
import { ollamaHealthCheck, generateText, listOllamaModels } from './core/local_llm.js';
import { dailyReportText, getSnapshot } from './core/treasury.js';
import { isWorkHours } from './core/scheduler.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const GREEN = '\x1b[32m✓\x1b[0m';
const RED   = '\x1b[31m✗\x1b[0m';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  process.stdout.write(`  Testing: ${name}… `);
  try {
    await fn();
    console.log(`${GREEN} PASS`);
    passed++;
  } catch (err) {
    console.log(`${RED} FAIL: ${(err as Error).message}`);
    failed++;
  }
}

async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║  Operation Underbid — Smoke Tests   ║');
  console.log('╚══════════════════════════════════════╝\n');

  // ── Database ─────────────────────────────────────────────────────────────
  await test('SQLite open + schema', async () => {
    const db = getDb();
    const row = db.prepare('SELECT 1 as n').get() as { n: number };
    if (row.n !== 1) throw new Error('Unexpected result');
  });

  await test('SQLite read orders table', async () => {
    const db = getDb();
    db.prepare('SELECT COUNT(*) FROM orders').get();
  });

  // ── Queue ─────────────────────────────────────────────────────────────────
  await test('BullMQ: enqueue test job', async () => {
    const jobId = await enqueue('health_check', {}, { dedupeKey: `smoke_${Date.now()}` });
    if (!jobId) throw new Error('No job ID returned');
    await closeQueues();
  });

  // ── Local LLM ─────────────────────────────────────────────────────────────
  await test('Ollama health check', async () => {
    const ok = await ollamaHealthCheck();
    if (!ok) throw new Error('Ollama offline — start with: ollama serve');
  });

  await test('Ollama list models', async () => {
    const models = await listOllamaModels();
    if (models.length === 0) throw new Error('No models available — run: ollama pull qwen2.5:32b-instruct-q4_K_M');
    console.log(`\n    Available: ${models.slice(0, 3).join(', ')}${models.length > 3 ? '…' : ''}`);
  });

  await test('Ollama text generation (short)', async () => {
    const text = await generateText('Reply with exactly the word: WORKING');
    if (!text || text.trim().length === 0) throw new Error('Empty response');
  });

  // ── Treasury ─────────────────────────────────────────────────────────────
  await test('Treasury snapshot', async () => {
    const snap = getSnapshot();
    if (typeof snap.balanceGbp !== 'number') throw new Error('Invalid snapshot');
  });

  await test('Treasury daily report', async () => {
    const report = dailyReportText();
    if (!report.includes('Daily Treasury')) throw new Error('Report malformed');
  });

  // ── Scheduler ─────────────────────────────────────────────────────────────
  await test('Work-hours check (function returns boolean)', async () => {
    const result = isWorkHours();
    if (typeof result !== 'boolean') throw new Error('Expected boolean');
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(42)}`);
  console.log(`Tests: ${passed + failed} total | ${passed} passed | ${failed} failed`);

  if (failed > 0) {
    console.log('\n⚠  Some tests failed. Fix issues above before starting the daemon.');
    process.exit(1);
  } else {
    console.log('\n✅  All smoke tests passed. System is ready.');
    console.log('    Start with: pm2 start pm2.config.js\n');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
