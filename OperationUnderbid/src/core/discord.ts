/**
 * discord.ts
 * Discord bot for Operation Underbid.
 * Outbound: status pings, daily reports, escalation alerts.
 * Inbound: slash commands (/status /pause /resume /shutdown /report /logs /override /reject /health)
 *
 * Uses discord.js v14 with a simple text-command parser (no slash-command registration
 * needed — just prefix commands that work in DMs and the configured channel).
 */
import {
  Client, GatewayIntentBits, Message,
  TextChannel, EmbedBuilder, ActivityType,
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { getSnapshot, dailyReportText } from './treasury.js';
import { getQueueDepth } from './queue.js';
import { dbAll } from '../db/db.js';

const MOD = 'discord';
const LOGS_DIR = path.resolve(process.cwd(), 'logs');

// ─── Shared state injected by orchestrator ────────────────────────────────────

export interface BotControls {
  isPaused: () => boolean;
  setPaused: (v: boolean) => void;
  requestShutdown: () => void;
  getUptimeSeconds: () => number;
  overrideOrder: (orderId: string) => void;
  rejectOrder: (orderId: string, reason: string) => void;
  getHealthReport: () => Promise<string>;
  getMode: () => string;
}

let _controls: BotControls | null = null;
let _client: Client | null = null;
let _channel: TextChannel | null = null;

export function registerControls(c: BotControls): void {
  _controls = c;
}

// ─── Initialise bot ───────────────────────────────────────────────────────────

export async function startDiscordBot(): Promise<void> {
  const cfg = getConfig();

  _client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
  });

  _client.once('ready', async () => {
    logger.info(MOD, `Discord bot online as ${_client!.user?.tag}`);
    _client!.user?.setActivity('Operation Underbid', { type: ActivityType.Watching });

    // Cache channel
    try {
      _channel = (await _client!.channels.fetch(cfg.discordChannelId)) as TextChannel;
    } catch (err) {
      logger.error(MOD, 'Could not fetch Discord channel', { err: (err as Error).message });
    }
  });

  _client.on('messageCreate', handleMessage);

  _client.on('error', (err) => logger.error(MOD, 'Discord client error', { err: err.message }));

  await _client.login(cfg.discordBotToken);
}

// ─── Command handling ─────────────────────────────────────────────────────────

async function handleMessage(msg: Message): Promise<void> {
  if (msg.author.bot) return;

  // Only respond in configured channel or DMs
  const cfg = getConfig();
  const inChannel = msg.channelId === cfg.discordChannelId;
  const inDm = msg.channel.type === 1; // DM_CHANNEL
  if (!inChannel && !inDm) return;

  const text = msg.content.trim();
  if (!text.startsWith('/')) return;

  const [cmd, ...args] = text.slice(1).split(/\s+/);

  logger.info(MOD, `Command received: /${cmd}`, { user: msg.author.username });

  switch (cmd.toLowerCase()) {
    case 'status':    return reply(msg, await statusText());
    case 'pause':     return handlePause(msg, true);
    case 'resume':    return handlePause(msg, false);
    case 'shutdown':  return handleShutdown(msg);
    case 'report':    return reply(msg, dailyReportText());
    case 'logs':      return handleLogs(msg, parseInt(args[0] ?? '30'));
    case 'override':  return handleOverride(msg, args[0]);
    case 'reject':    return handleReject(msg, args[0], args.slice(1).join(' '));
    case 'health':    return handleHealth(msg);
    default:
      return reply(msg, `Unknown command: \`/${cmd}\`\nAvailable: /status /pause /resume /shutdown /report /logs <n> /override <id> /reject <id> <reason> /health`);
  }
}

async function statusText(): Promise<string> {
  if (!_controls) return 'Bot not yet connected to orchestrator.';
  const snap = getSnapshot();
  const depth = await getQueueDepth();
  return [
    `**Operation Underbid Status**`,
    `Mode    : ${_controls.getMode()}`,
    `Paused  : ${_controls.isPaused() ? '⏸ YES' : '▶ NO'}`,
    `Uptime  : ${formatUptime(_controls.getUptimeSeconds())}`,
    `Queue   : ${depth} jobs pending`,
    `Today   : £${snap.todayGbp.toFixed(2)}`,
    `Balance : £${snap.balanceGbp.toFixed(2)}`,
  ].join('\n');
}

function handlePause(msg: Message, pause: boolean): void {
  _controls?.setPaused(pause);
  reply(msg, pause ? '⏸ System paused. In-flight orders will finish.' : '▶ System resumed.');
}

async function handleShutdown(msg: Message): Promise<void> {
  await reply(msg, '🛑 Graceful shutdown initiated. Goodbye.');
  _controls?.requestShutdown();
}

function handleLogs(msg: Message, n: number): void {
  const count = Math.min(Math.max(1, n), 100);
  const today = new Date().toISOString().slice(0, 10);
  const logFile = path.join(LOGS_DIR, `orchestrator-${today}.log`);

  if (!fs.existsSync(logFile)) {
    reply(msg, `No log file for today: ${logFile}`);
    return;
  }

  const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);
  const last = lines.slice(-count).join('\n');
  const truncated = last.length > 1900 ? '...\n' + last.slice(-1900) : last;
  reply(msg, `\`\`\`\n${truncated}\n\`\`\``);
}

function handleOverride(msg: Message, orderId?: string): void {
  if (!orderId) { reply(msg, 'Usage: /override <order_id>'); return; }
  _controls?.overrideOrder(orderId);
  reply(msg, `✅ Order \`${orderId}\` force-approved.`);
}

function handleReject(msg: Message, orderId?: string, reason = ''): void {
  if (!orderId) { reply(msg, 'Usage: /reject <order_id> <reason>'); return; }
  _controls?.rejectOrder(orderId, reason);
  reply(msg, `❌ Order \`${orderId}\` rejected: ${reason || '(no reason given)'}`);
}

async function handleHealth(msg: Message): Promise<void> {
  const report = await _controls?.getHealthReport() ?? 'Orchestrator not connected.';
  reply(msg, `\`\`\`\n${report}\n\`\`\``);
}

// ─── Outbound messaging ───────────────────────────────────────────────────────

export async function ping(message: string): Promise<void> {
  if (!_channel) {
    logger.warn(MOD, 'Cannot ping — channel not available');
    return;
  }
  try {
    await _channel.send(message);
  } catch (err) {
    logger.error(MOD, 'Failed to send Discord ping', { err: (err as Error).message });
  }
}

export async function pingAlert(title: string, description: string, urgent = false): Promise<void> {
  if (!_channel) return;
  const embed = new EmbedBuilder()
    .setTitle((urgent ? '🚨 ' : '⚠️ ') + title)
    .setDescription(description)
    .setColor(urgent ? 0xFF0000 : 0xFFA500)
    .setTimestamp();
  try {
    await _channel.send({ embeds: [embed] });
  } catch { /* ignore */ }
}

// Supervised-mode: send draft + await 👍 or /reject reply with timeout
export async function awaitApproval(
  orderId: string,
  summary: string,
  timeoutMs = 30 * 60 * 1000
): Promise<'approved' | 'rejected' | 'timeout'> {
  if (!_channel) return 'approved'; // No Discord = auto-approve

  await _channel.send(
    `📦 **Supervised delivery pending** for order \`${orderId}\`\n\n${summary}\n\n` +
    `React with 👍 to deliver, or reply \`/reject ${orderId} <reason>\` to regenerate.`
  );

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      collector.stop();
      resolve('timeout');
    }, timeoutMs);

    // Listen for 👍 reaction on the last message
    _channel!.awaitMessages({
      filter: (m: Message) => !m.author.bot && (
        m.content.toLowerCase().startsWith(`/reject ${orderId}`) ||
        m.content === '👍'
      ),
      max: 1,
      time: timeoutMs,
    }).then((collected) => {
      clearTimeout(timer);
      const first = collected.first();
      if (!first) return resolve('timeout');
      if (first.content === '👍') return resolve('approved');
      return resolve('rejected');
    }).catch(() => { clearTimeout(timer); resolve('timeout'); });

    const collector = { stop: () => {} }; // Placeholder for proper collector cleanup
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function reply(msg: Message, text: string): void {
  msg.reply(text.slice(0, 2000)).catch((err: Error) =>
    logger.error(MOD, 'Failed to send Discord reply', { err: err.message })
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export async function stopDiscordBot(): Promise<void> {
  await _client?.destroy();
  _client = null;
  _channel = null;
}
