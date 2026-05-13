import axios, { AxiosError } from 'axios';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import type { LlmRequest, LlmResponse, LlmRole } from '../types/index.js';

const MOD = 'local_llm';

// ─── Model routing ────────────────────────────────────────────────────────────

function modelForRole(role: LlmRole): string {
  const cfg = getConfig();
  switch (role) {
    case 'vision':   return cfg.ollamaVisionModel;
    case 'code':     return cfg.ollamaCodeModel;
    case 'fallback': return cfg.ollamaFallbackModel;
    default:         return cfg.ollamaTextModel;
  }
}

// ─── Retry with exponential backoff ──────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, attempts = 4, baseDelayMs = 2000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const delay = baseDelayMs * 2 ** i;
        logger.warn(MOD, `Retry ${i + 1}/${attempts - 1} in ${delay}ms`, { err: (err as Error).message });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ─── Core generate call ───────────────────────────────────────────────────────

export async function generate(req: LlmRequest): Promise<LlmResponse> {
  const cfg = getConfig();
  const model = modelForRole(req.role);
  const start = Date.now();

  // Build messages array
  const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [];

  if (req.systemPrompt) {
    messages.push({ role: 'system', content: req.systemPrompt });
  }

  if (req.imageBase64 && req.role === 'vision') {
    // Vision model: multimodal message
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: req.prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${req.imageBase64}` } },
      ],
    });
  } else {
    messages.push({ role: 'user', content: req.prompt });
  }

  logger.debug(MOD, `Calling ${model}`, { role: req.role, promptLen: req.prompt.length });

  const response = await withRetry(async () => {
    const res = await axios.post(
      `${cfg.ollamaHost}/api/chat`,
      {
        model,
        messages,
        options: {
          temperature: req.temperature ?? 0.7,
          num_predict: req.maxTokens ?? 2048,
        },
        stream: false,
      },
      { timeout: 300_000 } // 5 min — large models are slow
    );
    return res.data;
  });

  const text = response.message?.content ?? '';
  const durationMs = Date.now() - start;

  logger.debug(MOD, `Response from ${model}`, { chars: text.length, durationMs });

  return {
    text,
    model,
    promptTokens: response.prompt_eval_count ?? 0,
    completionTokens: response.eval_count ?? 0,
    durationMs,
  };
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export async function generateText(prompt: string, system?: string): Promise<string> {
  const res = await generate({ role: 'text', prompt, systemPrompt: system });
  return res.text;
}

export async function generateCode(prompt: string, system?: string): Promise<string> {
  const res = await generate({ role: 'code', prompt, systemPrompt: system });
  return res.text;
}

export async function describeScreen(screenshotBase64: string, question: string): Promise<string> {
  const res = await generate({
    role: 'vision',
    prompt: question,
    imageBase64: screenshotBase64,
    systemPrompt: 'You are a vision model analysing a browser screenshot. Answer precisely and concisely.',
  });
  return res.text;
}

// ─── Fallback upgrade when primary model scores too low ───────────────────────

export async function generateWithFallback(req: LlmRequest, minLength = 200): Promise<LlmResponse> {
  const primary = await generate(req);
  if (primary.text.trim().length >= minLength) return primary;

  logger.warn(MOD, `Primary model output too short (${primary.text.length} chars), escalating to fallback`);
  return generate({ ...req, role: 'fallback' });
}

// ─── Health check ─────────────────────────────────────────────────────────────

export async function ollamaHealthCheck(): Promise<boolean> {
  try {
    const cfg = getConfig();
    const res = await axios.get(`${cfg.ollamaHost}/api/tags`, { timeout: 5000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

// ─── List available models ────────────────────────────────────────────────────

export async function listOllamaModels(): Promise<string[]> {
  try {
    const cfg = getConfig();
    const res = await axios.get(`${cfg.ollamaHost}/api/tags`, { timeout: 5000 });
    return (res.data.models ?? []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}
