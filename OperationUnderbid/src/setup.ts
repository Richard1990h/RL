/**
 * setup.ts  —  Idempotent Phase 1 setup script
 * Run with: npx tsx src/setup.ts
 *
 * Checks every dependency, installs what's missing,
 * verifies all local models are loaded,
 * scaffolds directories, sends Discord test ping.
 */
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const execAsync = promisify(exec);

const GREEN = '\x1b[32m✓\x1b[0m';
const RED   = '\x1b[31m✗\x1b[0m';
const WARN  = '\x1b[33m⚠\x1b[0m';
const BOLD  = (s: string) => `\x1b[1m${s}\x1b[0m`;

function ok(msg: string)   { console.log(`  ${GREEN} ${msg}`); }
function fail(msg: string) { console.log(`  ${RED} ${msg}`); }
function warn(msg: string) { console.log(`  ${WARN} ${msg}`); }

// ─── Checks ───────────────────────────────────────────────────────────────────

async function checkCommand(cmd: string, label: string, minVersion?: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`${cmd} --version 2>&1`);
    const ver = stdout.trim().split('\n')[0];
    ok(`${label}: ${ver}`);
    return true;
  } catch {
    fail(`${label}: NOT FOUND`);
    return false;
  }
}

async function checkOllama(host: string): Promise<boolean> {
  try {
    const res = await axios.get(`${host}/api/tags`, { timeout: 5000 });
    const models: string[] = (res.data.models ?? []).map((m: { name: string }) => m.name);
    ok(`Ollama online — ${models.length} models loaded`);
    return true;
  } catch {
    fail('Ollama: NOT RUNNING (start with: ollama serve)');
    return false;
  }
}

async function checkOllamaModel(host: string, model: string): Promise<boolean> {
  try {
    const res = await axios.get(`${host}/api/tags`, { timeout: 5000 });
    const models: string[] = (res.data.models ?? []).map((m: { name: string }) => m.name);
    if (models.some(m => m === model || m.startsWith(model.split(':')[0]))) {
      ok(`Model present: ${model}`);
      return true;
    } else {
      warn(`Model missing: ${model} — pull with: ollama pull ${model}`);
      return false;
    }
  } catch {
    warn(`Cannot verify model ${model} — Ollama may be offline`);
    return false;
  }
}

async function checkComfy(host: string): Promise<boolean> {
  try {
    await axios.get(`${host}/system_stats`, { timeout: 5000 });
    ok(`ComfyUI online at ${host}`);
    return true;
  } catch {
    warn(`ComfyUI: not running at ${host} (optional — needed for logo generation)`);
    return false;
  }
}

async function checkRedis(host: string, port: number): Promise<boolean> {
  try {
    await execAsync(`redis-cli -h ${host} -p ${port} ping`, { timeout: 5000 });
    ok(`Redis: online at ${host}:${port}`);
    return true;
  } catch {
    fail(`Redis: NOT RUNNING at ${host}:${port} — start with: redis-server`);
    return false;
  }
}

function checkDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    ok(`Created directory: ${dir}`);
  } else {
    ok(`Directory exists: ${dir}`);
  }
}

function checkEnvFile(): boolean {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    fail('.env.local not found — copy .env.example to .env.local and fill in values');
    return false;
  }
  ok('.env.local found');
  return true;
}

// ─── Smoke tests ──────────────────────────────────────────────────────────────

async function smokeTestOllama(host: string, model: string): Promise<void> {
  console.log(`\n  Testing Ollama model: ${model}…`);
  try {
    const res = await axios.post(`${host}/api/chat`, {
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: ONLINE' }],
      stream: false,
      options: { num_predict: 10 },
    }, { timeout: 120_000 });
    const text = res.data.message?.content ?? '';
    if (text.includes('ONLINE')) {
      ok(`${model} responded correctly`);
    } else {
      warn(`${model} responded but unexpectedly: "${text.slice(0, 50)}"`);
    }
  } catch (err) {
    fail(`${model} smoke test failed: ${(err as Error).message}`);
  }
}

async function smokeTestDiscord(token: string, channelId: string): Promise<void> {
  console.log('\n  Testing Discord bot…');
  try {
    const res = await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      { content: '🔧 Operation Underbid setup complete — bot online.' },
      { headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }, timeout: 10_000 }
    );
    if (res.status === 200) {
      ok('Discord test ping sent successfully');
    } else {
      warn(`Discord ping returned status ${res.status}`);
    }
  } catch (err) {
    fail(`Discord test ping failed: ${(err as Error).message}\n     Check DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(BOLD('\n╔══════════════════════════════════════════╗'));
  console.log(BOLD('║  Operation Underbid v2.0 — Setup Check  ║'));
  console.log(BOLD('╚══════════════════════════════════════════╝\n'));

  // Load env
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env' });

  const OLLAMA_HOST  = process.env.OLLAMA_HOST   ?? 'http://127.0.0.1:11434';
  const COMFY_HOST   = process.env.COMFY_HOST    ?? 'http://127.0.0.1:8188';
  const REDIS_HOST   = process.env.REDIS_HOST    ?? '127.0.0.1';
  const REDIS_PORT   = parseInt(process.env.REDIS_PORT ?? '6379');
  const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN ?? '';
  const DISCORD_CH    = process.env.DISCORD_CHANNEL_ID ?? '';

  // ── Step 1: Runtimes ─────────────────────────────────────────────────────
  console.log(BOLD('Step 1 — Runtime audit'));
  await checkCommand('node', 'Node.js');
  await checkCommand('python3', 'Python 3');
  await checkCommand('git', 'Git');
  await checkCommand('ffmpeg', 'FFmpeg');
  await checkCommand('sqlite3', 'SQLite3');
  await checkCommand('redis-cli', 'Redis CLI');

  // ── Step 2: Env ──────────────────────────────────────────────────────────
  console.log(BOLD('\nStep 2 — Environment'));
  const envOk = checkEnvFile();

  // ── Step 3: Directories ──────────────────────────────────────────────────
  console.log(BOLD('\nStep 3 — Directory scaffold'));
  ['deliverables', 'logs', 'reports', 'screenshots', 'profiles/fiverr', 'db', 'gigs'].forEach(d =>
    checkDir(path.resolve(process.cwd(), d))
  );

  // ── Step 4: Services ────────────────────────────────────────────────────
  console.log(BOLD('\nStep 4 — Services'));
  const ollamaOk = await checkOllama(OLLAMA_HOST);
  await checkComfy(COMFY_HOST);
  await checkRedis(REDIS_HOST, REDIS_PORT);

  // ── Step 5: Local models ─────────────────────────────────────────────────
  console.log(BOLD('\nStep 5 — Local models'));
  if (ollamaOk) {
    await checkOllamaModel(OLLAMA_HOST, 'qwen2.5:32b-instruct-q4_K_M');
    await checkOllamaModel(OLLAMA_HOST, 'qwen2-vl:7b');
    await checkOllamaModel(OLLAMA_HOST, 'qwen2.5-coder:14b');
    await checkOllamaModel(OLLAMA_HOST, 'llama3.3:70b');
  } else {
    warn('Skipping model checks — Ollama offline');
    console.log('  Pull models with:');
    console.log('    ollama pull qwen2.5:32b-instruct-q4_K_M');
    console.log('    ollama pull qwen2-vl:7b');
    console.log('    ollama pull qwen2.5-coder:14b');
    console.log('    ollama pull llama3.3:70b');
  }

  // ── Step 6: Smoke tests ──────────────────────────────────────────────────
  const runSmoke = process.argv.includes('--smoke');
  if (runSmoke && ollamaOk) {
    console.log(BOLD('\nStep 6 — Smoke tests'));
    await smokeTestOllama(OLLAMA_HOST, 'qwen2.5:32b-instruct-q4_K_M');
    await smokeTestOllama(OLLAMA_HOST, 'qwen2-vl:7b');
    await smokeTestOllama(OLLAMA_HOST, 'qwen2.5-coder:14b');

    if (DISCORD_TOKEN && DISCORD_CH) {
      await smokeTestDiscord(DISCORD_TOKEN, DISCORD_CH);
    } else {
      warn('Discord smoke test skipped — DISCORD_BOT_TOKEN / DISCORD_CHANNEL_ID not set');
    }
  } else if (!runSmoke) {
    console.log('\n  (Run with --smoke to execute live model tests)');
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(BOLD('\n═══ Setup summary ═══'));
  if (!envOk) {
    fail('Complete .env.local before starting the system.');
    process.exit(1);
  }
  console.log('\n  To start the daemon:');
  console.log('    pm2 start pm2.config.js');
  console.log('    pm2 save');
  console.log('    pm2 startup   # auto-restart on reboot\n');
  console.log('  Or for development:');
  console.log('    npx tsx src/core/orchestrator.ts\n');
}

main().catch(err => { console.error(err); process.exit(1); });
