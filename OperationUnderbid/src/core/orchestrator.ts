/**
 * orchestrator.ts  ·  Operation Underbid v2.0
 * ─────────────────────────────────────────────
 * THE MAIN LOOP. NEVER EXITS VOLUNTARILY.
 *
 * Startup sequence:
 *   1. Load config, open DB, validate env
 *   2. Start Discord bot
 *   3. Start health probe HTTP server
 *   4. Start watchdog
 *   5. Replay in-flight jobs from DB (crash recovery)
 *   6. Start BullMQ worker (all handlers wired)
 *   7. Start scheduler (cron jobs)
 *   8. Enter infinite sentinel loop
 *
 * Shutdown (only via /shutdown command or SIGTERM):
 *   - Drain queue, close browser, stop scheduler, destroy Discord.
 */
import 'dotenv/config';
import path from 'path';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { getDb, dbRun, dbAll, dbGet } from '../db/db.js';
import { enqueue, createWorker, closeQueues, getQueueDepth, JOB } from './queue.js';
import { startDiscordBot, stopDiscordBot, ping, pingAlert, registerControls, awaitApproval } from './discord.js';
import { startWatchdog, stopWatchdog, startHealthProbe, fullHealthReport, healthReportText, incrementModelFailureCount, resetModelFailureCount } from './watchdog.js';
import { startScheduler, stopScheduler, isWorkHours } from './scheduler.js';
import { fiverrDriver } from './fiverr_driver.js';
import { parseInboxScreen, detectPageState } from './vision.js';
import { produceDeliverable } from './producers/index.js';
import { runQa, qaWithRegeneration } from './qa.js';
import { reviewDraft, draftClarifyingQuestion, claudeBudgetExhausted } from './claude_review.js';
import { recordIncome, recordFee, dailyReportText, exportCsv } from './treasury.js';
import type { Order, Draft, JobPayload, ProcessOrderPayload, QaJobPayload, DeliverJobPayload } from '../types/index.js';

// ─── Global state ─────────────────────────────────────────────────────────────

const START_TIME = Date.now();
let _paused = false;
let _shutdownRequested = false;
let _healthServer: http.Server | null = null;
let _supervisedApprovals: Map<string, 'approved' | 'rejected' | null> = new Map();

// ─── Config ───────────────────────────────────────────────────────────────────

const cfg = loadConfig();
logger.info('orchestrator', '═══ Operation Underbid v2.0 starting ═══');
logger.info('orchestrator', 'Config loaded', {
  mode: cfg.supervisedMode ? 'supervised' : 'autonomous',
  timezone: cfg.timezone,
  workHours: `${cfg.workHoursStart}:00–${cfg.workHoursEnd}:00`,
});

// ─── Job handlers ─────────────────────────────────────────────────────────────

async function handlePollInbox(data: JobPayload): Promise<void> {
  if (_paused || !isWorkHours()) return;

  logger.info('poll_inbox', 'Polling Fiverr inbox…');

  // Ensure browser is up and logged in
  await fiverrDriver.init();
  const ok = await fiverrDriver.login();
  if (!ok) {
    await pingAlert('Login Failed', 'Fiverr login failed — check credentials or CAPTCHA.', true);
    return;
  }

  // Screenshot orders page, parse with vision model
  await fiverrDriver.goToOrders();
  const screenshot = await fiverrDriver.getScreenshotBase64();

  const state = await detectPageState(screenshot);
  if (state.isCaptcha) {
    await pingAlert('CAPTCHA Detected', 'Fiverr is showing a CAPTCHA. Manual intervention required.', true);
    return;
  }
  if (state.isLogin) {
    logger.warn('poll_inbox', 'Unexpectedly on login page after login — re-logging in');
    await fiverrDriver.login();
    return;
  }

  const parsed = await parseInboxScreen(screenshot);

  // Report any anomalies
  for (const anomaly of parsed.anomalies) {
    await pingAlert('Platform Anomaly', anomaly, anomaly.toLowerCase().includes('warn') || anomaly.toLowerCase().includes('suspend'));
  }

  // Enqueue new orders
  for (const order of parsed.orders) {
    const exists = dbGet<{ id: string }>('SELECT id FROM orders WHERE id=?', [order.id]);
    if (exists || !order.id) continue;

    // Insert order
    dbRun(
      `INSERT INTO orders (id, platform, gig_type, buyer_name, buyer_username, brief, price_gbp, status)
       VALUES (?,?,?,?,?,?,?,?)`,
      [order.id, 'fiverr', order.gigType, order.buyer, order.buyer, order.brief, parseFloat(order.price.replace(/[^0-9.]/g, '')) || 0, 'new']
    );

    logger.info('poll_inbox', `New order detected: ${order.id}`, { buyer: order.buyer, type: order.gigType });
    await enqueue(JOB.PROCESS_ORDER, { order_id: order.id });
    await ping(`📬 New order \`${order.id}\` from **${order.buyer}** (${order.gigType}) — processing…`);
  }

  // Enqueue unread message replies
  for (const msg of parsed.messages.filter(m => m.isUnread)) {
    await enqueue(JOB.POLL_INBOX, { platform: 'fiverr', _replyThread: msg.id, _preview: msg.preview } as JobPayload, {
      dedupeKey: `reply_${msg.id}`,
    });
  }
}

async function handleProcessOrder(data: JobPayload): Promise<void> {
  const { order_id } = data as ProcessOrderPayload;
  const order = dbGet<Order>('SELECT * FROM orders WHERE id=?', [order_id]);
  if (!order) { logger.error('process_order', `Order not found: ${order_id}`); return; }

  logger.info('process_order', `Processing order ${order_id}`, { type: order.gig_type });
  dbRun(`UPDATE orders SET status='in_progress' WHERE id=?`, [order_id]);

  // Check if brief needs clarification
  if (order.brief.split(' ').length < 5 && !claudeBudgetExhausted()) {
    const question = await draftClarifyingQuestion(order);
    if (question) {
      await fiverrDriver.sendMessage(order_id, question);
      dbRun(`UPDATE orders SET status='new' WHERE id=?`, [order_id]);
      logger.info('process_order', `Clarification requested for ${order_id}`);
      return;
    }
  }

  // Produce draft with regen loop
  let attemptNum = 0;
  const makeDraft = async (attempt: number): Promise<Draft> => {
    attemptNum = attempt;
    const filePath = await produceDeliverable(order);
    const draftId = uuidv4();
    dbRun(
      `INSERT INTO drafts (id, order_id, content, model_used, version) VALUES (?,?,?,?,?)`,
      [draftId, order_id, filePath, 'local', attempt]
    );
    return dbGet<Draft>('SELECT * FROM drafts WHERE id=?', [draftId])!;
  };

  const firstDraft = await makeDraft(1);
  const { finalDraft, passed: qaOk, attempts } = await qaWithRegeneration(order, [firstDraft], makeDraft);

  dbRun(`UPDATE orders SET status='review' WHERE id=?`, [order_id]);

  // Claude final review (if QA failed or always for first N orders)
  let approved = qaOk;
  let deliveryContent = finalDraft.content;

  if (!qaOk || cfg.supervisedMode) {
    const review = await reviewDraft(order, finalDraft);
    approved = review.approved;
    if (review.rewrittenContent) {
      deliveryContent = review.rewrittenContent;
      dbRun(`INSERT INTO drafts (id, order_id, content, model_used, version) VALUES (?,?,?,?,?)`,
        [uuidv4(), order_id, deliveryContent, 'claude', attemptNum + 1]);
    }
    if (!approved) {
      dbRun(`UPDATE orders SET status='new' WHERE id=?`, [order_id]);
      await pingAlert('Order Rejected by Claude', `Order \`${order_id}\` rejected after review. Notes: ${review.notes}`, false);
      return;
    }
  }

  dbRun(`UPDATE orders SET status='approved' WHERE id=?`, [order_id]);
  await enqueue(JOB.DELIVER, { order_id, deliverable_id: finalDraft.id } as DeliverJobPayload);
}

async function handleDeliver(data: JobPayload): Promise<void> {
  const { order_id, deliverable_id } = data as DeliverJobPayload;
  const order = dbGet<Order>('SELECT * FROM orders WHERE id=?', [order_id]);
  if (!order) return;

  const draft = dbGet<Draft>('SELECT * FROM drafts WHERE id=?', [deliverable_id]);
  if (!draft) return;

  const content = draft.content;
  const isFile = content.startsWith('/');

  // Supervised mode: wait for Discord 👍
  if (cfg.supervisedMode) {
    const summary = isFile
      ? `File: \`${path.basename(content)}\``
      : `Preview:\n\`\`\`\n${content.slice(0, 300)}\n\`\`\``;

    const decision = await awaitApproval(order_id, summary);

    if (decision === 'rejected') {
      logger.info('deliver', `Order ${order_id} rejected by user — regenerating`);
      dbRun(`UPDATE orders SET status='in_progress' WHERE id=?`, [order_id]);
      await enqueue(JOB.PROCESS_ORDER, { order_id });
      return;
    }

    if (decision === 'timeout') {
      logger.warn('deliver', `Approval timed out for order ${order_id} — auto-approving`);
    }
  }

  // Build delivery message
  const deliveryMessage = buildDeliveryMessage(order);

  logger.info('deliver', `Delivering order ${order_id}`);
  const ok = await fiverrDriver.deliverOrder(order_id, isFile ? content : '', deliveryMessage);

  if (!ok) {
    await pingAlert('Delivery Failed', `Order \`${order_id}\` could not be delivered. Manual action required.`, true);
    return;
  }

  dbRun(`UPDATE orders SET status='delivered' WHERE id=?`, [order_id]);

  // Record income (Fiverr takes 20%)
  const netGbp = order.price_gbp * 0.8;
  recordIncome(order_id, order.price_gbp, `Fiverr order ${order_id} — ${order.gig_type}`);
  recordFee(order_id, order.price_gbp * 0.2, 'Fiverr 20% service fee');

  await ping(`✅ Order \`${order_id}\` delivered. Net: £${netGbp.toFixed(2)}`);
  logger.info('deliver', `Order ${order_id} delivered successfully`, { net: netGbp });
}

async function handleHealthCheck(): Promise<void> {
  const report = await fullHealthReport();
  if (!report.healthy) {
    logger.warn('health', 'Health check issues', { issues: report.issues });
  }
}

async function handleDailyReport(data: JobPayload): Promise<void> {
  const report = dailyReportText();
  const csvPath = exportCsv();
  await ping(report);
  logger.info('scheduler', `Daily report sent. CSV: ${csvPath}`);
}

async function handleWeeklyReview(): Promise<void> {
  // Placeholder for pricing review logic — logs a prompt for manual review
  const week = new Date().toISOString().slice(0, 10);
  await ping(`📊 **Weekly review** (${week}): Check gig analytics at fiverr.com/seller_dashboard and consider adjusting pricing.`);
}

function buildDeliveryMessage(order: Order): string {
  const templates: Record<string, string> = {
    blog:    `Hi ${order.buyer_name}, your blog post is ready! I've written a well-researched, engaging article as requested. Let me know if you'd like any adjustments. Thank you for your order!`,
    logo:    `Hi ${order.buyer_name}, your logo design is complete! I've attached the files in the agreed format. Please let me know if you'd like any colour or style tweaks. Thanks!`,
    website: `Hi ${order.buyer_name}, your website is ready! I've built a clean, responsive one-page site as discussed. All files are included. Let me know if you need any changes!`,
    seo:     `Hi ${order.buyer_name}, your SEO package is delivered! Included: meta title, meta description, target keywords, and a full optimised article. Let me know if anything needs adjusting!`,
    caption: `Hi ${order.buyer_name}, your captions are ready in SRT format, compatible with YouTube, Premiere, and most video editors. Let me know if you need any changes!`,
    social:  `Hi ${order.buyer_name}, your social media posts are ready! I've written platform-specific copy for Twitter/X, Instagram, LinkedIn, Facebook, and TikTok. Let me know if you'd like any tweaks!`,
  };
  return templates[order.gig_type] ?? `Hi ${order.buyer_name}, your order is complete! Please review the attached deliverable. Thank you!`;
}

// ─── In-flight job replay (crash recovery) ────────────────────────────────────

async function replayInFlightJobs(): Promise<void> {
  const inFlight = dbAll<{ id: string; job_name: string; data: string }>(
    `SELECT id, job_name, data FROM job_history WHERE status IN ('pending','active') AND created_at > datetime('now','-24 hours')`
  );

  if (inFlight.length === 0) {
    logger.info('orchestrator', 'No in-flight jobs to replay');
    return;
  }

  logger.info('orchestrator', `Replaying ${inFlight.length} in-flight jobs from DB`);
  for (const job of inFlight) {
    try {
      await enqueue(job.job_name as any, JSON.parse(job.data), { dedupeKey: job.id });
    } catch (err) {
      logger.error('orchestrator', `Failed to replay job ${job.id}`, { err: (err as Error).message });
    }
  }
}

// ─── Main startup ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Open DB (creates it + runs schema if first boot)
  getDb();
  logger.info('orchestrator', 'Database ready');

  // Start Discord
  await startDiscordBot();

  // Register controls so Discord commands can drive the orchestrator
  registerControls({
    isPaused:         () => _paused,
    setPaused:        (v) => { _paused = v; logger.info('orchestrator', v ? 'Paused' : 'Resumed'); },
    requestShutdown:  () => { _shutdownRequested = true; },
    getUptimeSeconds: () => Math.floor((Date.now() - START_TIME) / 1000),
    overrideOrder:    (id) => { _supervisedApprovals.set(id, 'approved'); },
    rejectOrder:      (id) => { _supervisedApprovals.set(id, 'rejected'); },
    getHealthReport:  async () => healthReportText(await fullHealthReport()),
    getMode:          () => cfg.supervisedMode ? 'supervised' : 'autonomous',
  });

  // Start health probe
  _healthServer = startHealthProbe(9999);

  // Start watchdog
  startWatchdog();

  // Replay any jobs that were in-flight when we last crashed
  await replayInFlightJobs();

  // Wire up BullMQ worker
  createWorker({
    [JOB.POLL_INBOX]:       handlePollInbox,
    [JOB.PROCESS_ORDER]:    handleProcessOrder,
    [JOB.DELIVER]:          handleDeliver,
    [JOB.HEALTH_CHECK]:     handleHealthCheck,
    [JOB.DAILY_REPORT]:     handleDailyReport,
    [JOB.WEEKLY_REVIEW]:    handleWeeklyReview,
  });
  logger.info('orchestrator', 'Worker started');

  // Start scheduler
  startScheduler();

  await ping('🟢 **Operation Underbid v2.0 online.** Type `/status` for system state.');
  logger.info('orchestrator', '═══ All systems go — entering main loop ═══');

  // ── Infinite sentinel loop ─────────────────────────────────────────────────
  // This loop runs forever. Its only job is:
  //   1. Detect shutdown request.
  //   2. Catch and log any unhandled top-level exception.
  // All actual work is done by the BullMQ worker + scheduler above.
  while (true) {
    try {
      await new Promise(r => setTimeout(r, 5000));

      if (_shutdownRequested) {
        logger.info('orchestrator', 'Shutdown requested — draining and exiting gracefully');
        break;
      }
    } catch (err) {
      // Top-level catch: log, backoff, continue — NEVER exit
      logger.error('orchestrator', 'Unhandled exception in main loop', { err: (err as Error).message, stack: (err as Error).stack });
      await new Promise(r => setTimeout(r, 10_000)); // 10s backoff
    }
  }

  await shutdown();
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  logger.info('orchestrator', 'Shutting down…');
  stopScheduler();
  stopWatchdog();
  await closeQueues();
  await fiverrDriver.close();
  await stopDiscordBot();
  _healthServer?.close();
  logger.info('orchestrator', 'Shutdown complete. Goodbye.');
  process.exit(0);
}

// ─── Signal handlers ──────────────────────────────────────────────────────────

process.on('SIGTERM', () => { logger.info('orchestrator', 'SIGTERM received'); _shutdownRequested = true; });
process.on('SIGINT',  () => { logger.info('orchestrator', 'SIGINT received');  _shutdownRequested = true; });

// Catch-all for uncaught exceptions — log and continue (PM2 will restart if truly fatal)
process.on('uncaughtException', (err) => {
  logger.error('orchestrator', 'uncaughtException', { err: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logger.error('orchestrator', 'unhandledRejection', { reason: String(reason) });
});

// ─── Start ────────────────────────────────────────────────────────────────────
main().catch((err) => {
  logger.error('orchestrator', 'Fatal startup error', { err: (err as Error).message });
  process.exit(1); // PM2 will restart
});
