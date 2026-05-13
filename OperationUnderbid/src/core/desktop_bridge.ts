/**
 * desktop_bridge.ts
 * Spawns desktop.py as a child process and provides a typed API.
 * Falls back gracefully if Python desktop libs are unavailable.
 */
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { logger } from './logger.js';

const MOD = 'desktop_bridge';
const SCRIPT = path.resolve(__dirname, '../../src/core/desktop.py');

interface DesktopResponse {
  ok: boolean;
  error?: string;
  image?: string;   // base64 PNG
  pynput?: boolean;
  mss?: boolean;
}

class DesktopBridge {
  private proc: ChildProcess | null = null;
  private buf = '';
  private pendingResolvers: Array<(r: DesktopResponse) => void> = [];
  private available = false;

  async start(): Promise<boolean> {
    try {
      this.proc = spawn('python3', [SCRIPT], { stdio: ['pipe', 'pipe', 'inherit'] });

      this.proc.stdout!.on('data', (chunk: Buffer) => {
        this.buf += chunk.toString();
        const lines = this.buf.split('\n');
        this.buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const resp = JSON.parse(line) as DesktopResponse;
            const resolve = this.pendingResolvers.shift();
            resolve?.(resp);
          } catch {
            logger.warn(MOD, 'Unparseable stdout line', { line: line.slice(0, 200) });
          }
        }
      });

      this.proc.on('exit', (code) => {
        logger.warn(MOD, `desktop.py exited with code ${code}`);
        this.available = false;
        this.proc = null;
      });

      const pong = await this.send({ cmd: 'ping' });
      this.available = pong.ok === true;
      logger.info(MOD, `Desktop bridge ${this.available ? 'online' : 'degraded'}`, pong);
      return this.available;
    } catch (err) {
      logger.warn(MOD, 'Could not start desktop.py', { err: (err as Error).message });
      return false;
    }
  }

  private send(payload: Record<string, unknown>): Promise<DesktopResponse> {
    return new Promise((resolve) => {
      if (!this.proc?.stdin) {
        resolve({ ok: false, error: 'desktop.py not running' });
        return;
      }
      this.pendingResolvers.push(resolve);
      this.proc.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  async screenshot(): Promise<string | null> {
    if (!this.available) return null;
    const r = await this.send({ cmd: 'screenshot' });
    return r.ok ? (r.image ?? null) : null;
  }

  async mouseMove(x: number, y: number): Promise<void> {
    if (!this.available) return;
    await this.send({ cmd: 'mouse_move', x, y });
  }

  async click(x: number, y: number, button: 'left' | 'right' = 'left', double = false): Promise<void> {
    if (!this.available) return;
    await this.send({ cmd: 'click', x, y, button, double });
  }

  async scroll(x: number, y: number, direction: 'up' | 'down' = 'down', amount = 3): Promise<void> {
    if (!this.available) return;
    await this.send({ cmd: 'scroll', x, y, direction, amount });
  }

  async type(text: string): Promise<void> {
    if (!this.available) return;
    await this.send({ cmd: 'type', text });
  }

  async key(keys: string[]): Promise<void> {
    if (!this.available) return;
    await this.send({ cmd: 'key', keys });
  }

  async stop(): Promise<void> {
    if (this.proc) {
      await this.send({ cmd: 'quit' }).catch(() => {});
      this.proc.kill();
      this.proc = null;
    }
  }

  isAvailable(): boolean { return this.available; }
}

export const desktop = new DesktopBridge();
