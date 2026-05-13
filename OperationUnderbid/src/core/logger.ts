import fs from 'fs';
import path from 'path';

const LOGS_DIR = path.resolve(process.cwd(), 'logs');

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function getLogFile(): string {
  const d = new Date().toISOString().split('T')[0];
  return path.join(LOGS_DIR, `orchestrator-${d}.log`);
}

function formatLine(level: string, module: string, msg: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const extra = meta ? ' ' + JSON.stringify(meta) : '';
  return `[${ts}] [${level.padEnd(5)}] [${module}] ${msg}${extra}`;
}

function write(line: string) {
  ensureLogsDir();
  fs.appendFileSync(getLogFile(), line + '\n');
  process.stdout.write(line + '\n');
}

export const logger = {
  info:  (module: string, msg: string, meta?: unknown) => write(formatLine('INFO',  module, msg, meta)),
  warn:  (module: string, msg: string, meta?: unknown) => write(formatLine('WARN',  module, msg, meta)),
  error: (module: string, msg: string, meta?: unknown) => write(formatLine('ERROR', module, msg, meta)),
  debug: (module: string, msg: string, meta?: unknown) => {
    if (process.env.DEBUG) write(formatLine('DEBUG', module, msg, meta));
  },
};
