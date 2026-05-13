import { Queue, Worker, QueueEvents, Job, UnrecoverableError } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { dbRun, dbGet } from '../db/db.js';
import type { JobPayload } from '../types/index.js';

// ─── Job name registry ────────────────────────────────────────────────────────

export const JOB = {
  POLL_INBOX:        'poll_inbox',
  PROCESS_ORDER:     'process_order',
  QA:                'qa',
  DELIVER:           'deliver',
  WITHDRAWAL_CHECK:  'withdrawal_check',
  DAILY_REPORT:      'daily_report',
  WEEKLY_REVIEW:     'weekly_review',
  HEALTH_CHECK:      'health_check',
} as const;

export type JobName = (typeof JOB)[keyof typeof JOB];

// ─── Singleton queue + DLQ ────────────────────────────────────────────────────

let _mainQueue: Queue | null = null;
let _dlQueue: Queue | null = null;

function redisConnection() {
  const cfg = getConfig();
  return {
    host: cfg.redisHost,
    port: cfg.redisPort,
    password: cfg.redisPassword || undefined,
    maxRetriesPerRequest: null,
  };
}

export function getMainQueue(): Queue {
  if (!_mainQueue) {
    _mainQueue = new Queue('underbid-main', {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 200 },
        removeOnFail: false,
      },
    });
  }
  return _mainQueue;
}

export function getDlQueue(): Queue {
  if (!_dlQueue) {
    _dlQueue = new Queue('underbid-dlq', { connection: redisConnection() });
  }
  return _dlQueue;
}

// ─── Enqueue with idempotency ─────────────────────────────────────────────────

export async function enqueue(
  name: JobName,
  payload: JobPayload,
  opts: { dedupeKey?: string; delayMs?: number; priority?: number } = {}
): Promise<string> {
  const jobId = opts.dedupeKey ?? uuidv4();

  // Persist to SQLite before enqueuing so a Redis crash doesn't lose the job
  dbRun(
    `INSERT OR IGNORE INTO job_history (id, job_name, data, status, created_at)
     VALUES (?, ?, ?, 'pending', datetime('now'))`,
    [jobId, name, JSON.stringify(payload)]
  );

  await getMainQueue().add(name, payload, {
    jobId,
    delay: opts.delayMs,
    priority: opts.priority,
  });

  logger.info('queue', `Enqueued job`, { jobId, name });
  return jobId;
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export type JobHandler = (job: Job<JobPayload>) => Promise<unknown>;

export function createWorker(
  handlers: Partial<Record<JobName, JobHandler>>
): Worker {
  const cfg = getConfig();

  const worker = new Worker(
    'underbid-main',
    async (job) => {
      const handler = handlers[job.name as JobName];
      if (!handler) {
        logger.warn('worker', `No handler for job: ${job.name}`);
        return;
      }

      dbRun(
        `UPDATE job_history SET status='active', attempt=?, started_at=datetime('now') WHERE id=?`,
        [job.attemptsMade, job.id]
      );

      try {
        const result = await handler(job);
        dbRun(
          `UPDATE job_history SET status='completed', result=?, finished_at=datetime('now') WHERE id=?`,
          [JSON.stringify(result ?? null), job.id]
        );
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;

        dbRun(
          `UPDATE job_history SET status='failed', error=?, finished_at=datetime('now') WHERE id=?`,
          [msg, job.id]
        );

        // After final attempt, move to DLQ
        if (job.attemptsMade >= (job.opts.attempts ?? 5) - 1) {
          await getDlQueue().add(job.name, { ...job.data, _error: msg, _jobId: job.id });
          dbRun(`UPDATE job_history SET status='dead' WHERE id=?`, [job.id]);
          dbRun(
            `INSERT INTO errors (id, module, job_id, message, stack) VALUES (?,?,?,?,?)`,
            [uuidv4(), 'worker', job.id, msg, stack ?? null]
          );
          // Throw UnrecoverableError so BullMQ stops retrying
          throw new UnrecoverableError(`Job ${job.id} exhausted retries: ${msg}`);
        }

        logger.error('worker', `Job failed (attempt ${job.attemptsMade + 1})`, { jobId: job.id, name: job.name, msg });
        throw err; // rethrow so BullMQ retries with backoff
      }
    },
    {
      connection: redisConnection(),
      concurrency: 2,
      lockDuration: 120_000,
    }
  );

  worker.on('error', (err) => logger.error('worker', 'Worker error', { msg: err.message }));

  return worker;
}

// ─── Queue stats helper ───────────────────────────────────────────────────────

export async function getQueueDepth(): Promise<number> {
  const counts = await getMainQueue().getJobCounts('active', 'waiting', 'delayed');
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

export async function closeQueues(): Promise<void> {
  await _mainQueue?.close();
  await _dlQueue?.close();
}
