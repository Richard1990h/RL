/**
 * scheduler.ts
 * Cron-style recurring job enqueuer.
 * Uses node-cron to trigger BullMQ jobs on a schedule.
 * All times are in the configured timezone.
 */
import cron from 'node-cron';
import { enqueue, JOB } from './queue.js';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { ping } from './discord.js';
import { needsWithdrawalAlert } from './treasury.js';

const MOD = 'scheduler';
const tasks: cron.ScheduledTask[] = [];

// ─── Work-hours gate ──────────────────────────────────────────────────────────

export function isWorkHours(): boolean {
  const cfg = getConfig();
  const now = new Date();
  const hour = now.getHours(); // Simplified — for full TZ support use a date-fns-tz
  return hour >= cfg.workHoursStart && hour < cfg.workHoursEnd;
}

// ─── Random jitter ────────────────────────────────────────────────────────────

function jitterMs(base: number, spreadMs = 15_000): number {
  return base + Math.random() * spreadMs - spreadMs / 2;
}

// ─── Start all schedules ──────────────────────────────────────────────────────

export function startScheduler(): void {
  const cfg = getConfig();

  // ── Inbox polling (every 90–120s, work hours only) ────────────────────────
  // Cron doesn't support sub-minute randomisation natively, so we use a 1-minute
  // cron that internally decides whether to fire based on a random gate.
  let lastPollMs = 0;

  tasks.push(cron.schedule('* * * * *', async () => {
    if (!isWorkHours()) return;

    const pollIntervalMs =
      (cfg.pollIntervalMinSecs + Math.random() * (cfg.pollIntervalMaxSecs - cfg.pollIntervalMinSecs)) * 1000;

    if (Date.now() - lastPollMs < pollIntervalMs) return;
    lastPollMs = Date.now();

    await enqueue(JOB.POLL_INBOX, { platform: 'fiverr' }, {
      dedupeKey: `poll_fiverr_${Math.floor(Date.now() / 60000)}`,
    });
  }));

  // ── Health check (every 5 minutes) ─────────────────────────────────────────
  tasks.push(cron.schedule('*/5 * * * *', async () => {
    await enqueue(JOB.HEALTH_CHECK, {}, {
      dedupeKey: `health_${Math.floor(Date.now() / 300000)}`,
    });
  }));

  // ── Daily report at 21:00 ───────────────────────────────────────────────────
  tasks.push(cron.schedule('0 21 * * *', async () => {
    const date = new Date().toISOString().slice(0, 10);
    await enqueue(JOB.DAILY_REPORT, { date }, { dedupeKey: `daily_report_${date}` });
  }));

  // ── Weekly pricing review (Sunday 10:00) ────────────────────────────────────
  tasks.push(cron.schedule('0 10 * * 0', async () => {
    const week = getIsoWeek();
    await enqueue(JOB.WEEKLY_REVIEW, {}, { dedupeKey: `weekly_review_${week}` });
  }));

  // ── Withdrawal alert check (every 6 hours) ──────────────────────────────────
  tasks.push(cron.schedule('0 */6 * * *', async () => {
    if (needsWithdrawalAlert()) {
      const { getSnapshot } = await import('./treasury.js');
      const snap = getSnapshot();
      await ping(`💰 **Withdrawal reminder**: £${snap.pendingGbp.toFixed(2)} pending on Fiverr. Consider withdrawing.`);
    }
  }));

  // ── Weekend slowdown (Saturday & Sunday — just a log nudge) ─────────────────
  tasks.push(cron.schedule('0 9 * * 6,0', async () => {
    logger.info(MOD, 'Weekend mode: operating at reduced pace');
  }));

  logger.info(MOD, 'Scheduler started — all recurring jobs registered');
}

export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks.length = 0;
  logger.info(MOD, 'Scheduler stopped');
}

function getIsoWeek(): string {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
