import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env in project root
dotenv.config({ path: path.join(__dirname, '../.env') });

export const SUPPORTED_PROVIDERS = ['google', 'openai', 'anthropic', 'openrouter'];

export const DEFAULT_PROVIDER_MODELS = {
  google: 'gemini-3.5-flash',
  openai: 'gpt-4o',
  anthropic: 'claude-3-7-sonnet-latest',
  openrouter: 'google/gemini-2.5-flash'
};

const PROVIDER_ALIASES = {
  google: 'google',
  gemini: 'google',
  openai: 'openai',
  anthropic: 'anthropic',
  claude: 'anthropic',
  openrouter: 'openrouter'
};

const PROVIDER_KEY_ENV_MAP = {
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY']
};

const PROVIDER_MODEL_ENV_MAP = {
  google: 'GEMINI_MODEL',
  openai: 'OPENAI_MODEL',
  anthropic: 'ANTHROPIC_MODEL',
  openrouter: 'OPENROUTER_MODEL'
};

/**
 * Normalizes and validates a provider identifier.
 */
export function normalizeProvider(rawProvider, fallback = 'google') {
  const cleaned = String(rawProvider || '').trim().toLowerCase();
  if (!cleaned) return fallback;
  const normalized = PROVIDER_ALIASES[cleaned];
  if (!normalized) {
    throw new Error(
      `Unsupported AI provider '${rawProvider}'. Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}.`
    );
  }
  return normalized;
}

/**
 * Resolves the default model configured for a given provider.
 */
export function getDefaultModelForProvider(provider) {
  const norm = normalizeProvider(provider);
  const envVar = PROVIDER_MODEL_ENV_MAP[norm];
  const envModel = envVar ? (process.env[envVar] || '').trim() : '';
  return envModel || DEFAULT_PROVIDER_MODELS[norm];
}

/**
 * Resolves the provider and model for a specific specialization:
 * - 'vision': handwriting transcription and exam question OCR (PDF / Image)
 * - 'evaluation': Exercise 4 rubric marking and corrected version generation
 */
export function getTaskAiConfig(taskType = 'evaluation') {
  const isVision = taskType === 'vision';
  const explicitProviderRaw = (
    isVision ? process.env.AI_VISION_PROVIDER : process.env.AI_EVAL_PROVIDER
  ) || '';
  const explicitModel = (
    isVision ? process.env.AI_VISION_MODEL : process.env.AI_EVAL_MODEL
  ) || '';

  const hasExplicitProvider = Boolean(explicitProviderRaw.trim());
  const globalProviderRaw = (process.env.AI_PROVIDER || '').trim();
  const globalModel = (process.env.AI_MODEL || '').trim();

  const provider = normalizeProvider(
    hasExplicitProvider ? explicitProviderRaw : (globalProviderRaw || 'google')
  );

  // Only inherit global AI_MODEL when the task did not switch to a different provider
  let model = explicitModel.trim();
  if (!model && !hasExplicitProvider && globalModel) {
    model = globalModel;
  }
  if (!model) {
    model = getDefaultModelForProvider(provider);
  }

  return {
    taskType: isVision ? 'vision' : 'evaluation',
    provider,
    model
  };
}

/**
 * Returns the primary API key and environment variable name for a provider.
 */
export function getProviderApiKey(provider) {
  const norm = normalizeProvider(provider);
  const envVars = PROVIDER_KEY_ENV_MAP[norm] || [];

  for (const envName of envVars) {
    const raw = (process.env[envName] || '').trim();
    if (raw) {
      const firstKey = raw.split(',').map((s) => s.trim()).filter(Boolean)[0] || '';
      if (firstKey) {
        return { apiKey: firstKey, envVarName: envName };
      }
    }
  }

  return { apiKey: '', envVarName: envVars[0] || 'AI_API_KEY' };
}

/**
 * Returns the base API URL for REST-based providers.
 */
export function getProviderBaseUrl(provider) {
  const norm = normalizeProvider(provider);
  const stripTrailingSlash = (url) => url.replace(/\/+$/, '');

  switch (norm) {
    case 'openai':
      return stripTrailingSlash(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
    case 'anthropic':
      return stripTrailingSlash(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1');
    case 'openrouter':
      return stripTrailingSlash(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1');
    default:
      return '';
  }
}

/**
 * Backward-compatible helper for Gemini keys.
 */
export function getGeminiApiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) {
    keys.push(...process.env.GEMINI_API_KEY.split(',').map((s) => s.trim()).filter(Boolean));
  }
  if (process.env.GEMINI_FALLBACK_API_KEY) {
    keys.push(...process.env.GEMINI_FALLBACK_API_KEY.split(',').map((s) => s.trim()).filter(Boolean));
  }
  if (process.env.GEMINI_API_KEYS) {
    keys.push(...process.env.GEMINI_API_KEYS.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return [...new Set(keys)];
}

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 120000),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || DEFAULT_PROVIDER_MODELS.google,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramTeacherGroupId: process.env.TELEGRAM_TEACHER_GROUP_ID || '',
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 86400)
};

export default config;
