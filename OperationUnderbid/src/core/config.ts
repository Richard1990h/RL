import dotenv from 'dotenv';
import path from 'path';
import type { AppConfig } from '../types/index.js';

// Load .env.local first, then fall back to .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional_env(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export function loadConfig(): AppConfig {
  return {
    anthropicApiKey:      require_env('ANTHROPIC_API_KEY'),
    ollamaHost:           optional_env('OLLAMA_HOST', 'http://127.0.0.1:11434'),
    ollamaTextModel:      optional_env('OLLAMA_TEXT_MODEL', 'qwen2.5:32b-instruct-q4_K_M'),
    ollamaVisionModel:    optional_env('OLLAMA_VISION_MODEL', 'qwen2-vl:7b'),
    ollamaCodeModel:      optional_env('OLLAMA_CODE_MODEL', 'qwen2.5-coder:14b'),
    ollamaFallbackModel:  optional_env('OLLAMA_FALLBACK_MODEL', 'llama3.3:70b'),
    comfyHost:            optional_env('COMFY_HOST', 'http://127.0.0.1:8188'),
    redisHost:            optional_env('REDIS_HOST', '127.0.0.1'),
    redisPort:            parseInt(optional_env('REDIS_PORT', '6379')),
    redisPassword:        optional_env('REDIS_PASSWORD', ''),
    discordBotToken:      require_env('DISCORD_BOT_TOKEN'),
    discordChannelId:     require_env('DISCORD_CHANNEL_ID'),
    discordGuildId:       optional_env('DISCORD_GUILD_ID', ''),
    fiverrEmail:          require_env('FIVERR_EMAIL'),
    fiverrPassword:       require_env('FIVERR_PASSWORD'),
    fiverrUsername:       require_env('FIVERR_USERNAME'),
    supervisedMode:       optional_env('SUPERVISED_MODE', 'true') === 'true',
    maxClaudeCallsPerDay: parseInt(optional_env('MAX_CLAUDE_CALLS_PER_DAY', '30')),
    workHoursStart:       parseInt(optional_env('WORK_HOURS_START', '8')),
    workHoursEnd:         parseInt(optional_env('WORK_HOURS_END', '23')),
    timezone:             optional_env('TIMEZONE', 'Europe/London'),
    pollIntervalMinSecs:  parseInt(optional_env('POLL_INTERVAL_MIN_SECS', '90')),
    pollIntervalMaxSecs:  parseInt(optional_env('POLL_INTERVAL_MAX_SECS', '120')),
    gpuTempAlertC:        parseInt(optional_env('GPU_TEMP_ALERT_C', '80')),
    minQaScore:           parseInt(optional_env('MIN_QA_SCORE', '7')),
    maxRegenAttempts:     parseInt(optional_env('MAX_REGEN_ATTEMPTS', '3')),
    autoRefundLimitGbp:   parseFloat(optional_env('AUTO_REFUND_LIMIT_GBP', '50')),
  };
}

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) _config = loadConfig();
  return _config;
}
