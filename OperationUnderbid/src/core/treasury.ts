/**
 * treasury.ts
 * Tracks all financial events (income, refunds, withdrawals, fees).
 * Polls Fiverr dashboard for pending balance. Exports CSV ledger.
 * Pings Discord when balance > AUTO_WITHDRAW threshold.
 */
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { dbRun, dbAll, dbGet } from '../db/db.js';
import type { LedgerEntry, TreasurySnapshot } from '../types/index.js';

const MOD = 'treasury';
const REPORTS_DIR = path.resolve(process.cwd(), 'reports');

// ─── Record events ────────────────────────────────────────────────────────────

export function recordIncome(orderId: string, amountGbp: number, description: string): void {
  dbRun(
    `INSERT INTO ledger (id, order_id, type, amount_gbp, description) VALUES (?,?,?,?,?)`,
    [uuidv4(), orderId, 'income', amountGbp, description]
  );
  logger.info(MOD, `Income recorded: £${amountGbp.toFixed(2)}`, { orderId, description });
}

export function recordRefund(orderId: string, amountGbp: number, description: string): void {
  dbRun(
    `INSERT INTO ledger (id, order_id, type, amount_gbp, description) VALUES (?,?,?,?,?)`,
    [uuidv4(), orderId, 'refund', -Math.abs(amountGbp), description]
  );
  logger.warn(MOD, `Refund recorded: £${amountGbp.toFixed(2)}`, { orderId });
}

export function recordWithdrawal(amountGbp: number, description: string): void {
  dbRun(
    `INSERT INTO ledger (id, order_id, type, amount_gbp, description) VALUES (?,?,?,?,?)`,
    [uuidv4(), null, 'withdrawal', -Math.abs(amountGbp), description]
  );
  logger.info(MOD, `Withdrawal recorded: £${amountGbp.toFixed(2)}`);
}

export function recordFee(orderId: string | null, amountGbp: number, description: string): void {
  dbRun(
    `INSERT INTO ledger (id, order_id, type, amount_gbp, description) VALUES (?,?,?,?,?)`,
    [uuidv4(), orderId, 'fee', -Math.abs(amountGbp), description]
  );
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export function getSnapshot(): TreasurySnapshot {
  const all = dbAll<LedgerEntry>(`SELECT * FROM ledger`);

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';

  let totalIncome = 0, totalRefunds = 0, totalWithdrawals = 0, totalFees = 0;
  let monthToDate = 0, todayTotal = 0, pendingGbp = 0;

  for (const row of all) {
    const amt = row.amount_gbp;
    const date = row.recorded_at.slice(0, 10);

    if (row.type === 'income')      { totalIncome += amt; }
    if (row.type === 'refund')      { totalRefunds += Math.abs(amt); }
    if (row.type === 'withdrawal')  { totalWithdrawals += Math.abs(amt); }
    if (row.type === 'fee')         { totalFees += Math.abs(amt); }
    if (date >= monthStart)         { monthToDate += amt; }
    if (date === today)             { todayTotal += amt; }
  }

  // Pending = income from orders not yet withdrawn (approximation)
  const pending = dbGet<{ n: number }>(
    `SELECT SUM(amount_gbp) as n FROM ledger WHERE type='income'
     AND order_id NOT IN (SELECT order_id FROM ledger WHERE type='withdrawal' AND order_id IS NOT NULL)`
  );
  pendingGbp = Math.max(0, pending?.n ?? 0);

  return {
    totalIncomeGbp: totalIncome,
    totalRefundsGbp: totalRefunds,
    totalWithdrawalsGbp: totalWithdrawals,
    totalFeesGbp: totalFees,
    balanceGbp: totalIncome - totalRefunds - totalWithdrawals - totalFees,
    pendingGbp,
    monthToDateGbp: monthToDate,
    todayGbp: todayTotal,
  };
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export function exportCsv(outputPath?: string): string {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const file = outputPath ?? path.join(REPORTS_DIR, `ledger-${date}.csv`);

  const rows = dbAll<LedgerEntry>(`SELECT * FROM ledger ORDER BY recorded_at ASC`);

  const header = 'id,order_id,type,amount_gbp,description,recorded_at\n';
  const body = rows
    .map(r =>
      [r.id, r.order_id ?? '', r.type, r.amount_gbp.toFixed(2), `"${r.description.replace(/"/g, '""')}"`, r.recorded_at].join(',')
    )
    .join('\n');

  fs.writeFileSync(file, header + body);
  logger.info(MOD, `CSV exported to ${file}`);
  return file;
}

// ─── Daily report string ──────────────────────────────────────────────────────

export function dailyReportText(): string {
  const s = getSnapshot();
  const orders = dbAll<{ n: number }>(`SELECT COUNT(*) as n FROM orders WHERE date(created_at)=date('now')`);
  const delivered = dbAll<{ n: number }>(`SELECT COUNT(*) as n FROM orders WHERE status='delivered' AND date(updated_at)=date('now')`);

  return [
    `📊 **Daily Treasury Report** — ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `Today       : £${s.todayGbp.toFixed(2)}`,
    `Month-to-date : £${s.monthToDateGbp.toFixed(2)}`,
    `Balance       : £${s.balanceGbp.toFixed(2)}`,
    `Pending       : £${s.pendingGbp.toFixed(2)}`,
    ``,
    `Orders today  : ${orders[0]?.n ?? 0} new / ${delivered[0]?.n ?? 0} delivered`,
    ``,
    `Total income  : £${s.totalIncomeGbp.toFixed(2)}`,
    `Total refunds : £${s.totalRefundsGbp.toFixed(2)}`,
    `Total fees    : £${s.totalFeesGbp.toFixed(2)}`,
  ].join('\n');
}

// ─── Withdrawal alert check ───────────────────────────────────────────────────

export function needsWithdrawalAlert(): boolean {
  const s = getSnapshot();
  const cfg = getConfig();
  return s.pendingGbp >= cfg.autoRefundLimitGbp * 10; // Alert when 10× the refund limit
}
