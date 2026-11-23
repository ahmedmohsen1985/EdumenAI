import {
  type AiProviderConfigView,
  type AiProviderId,
  AiProviderIdSchema,
  type AiTaskRouteView,
  type AiTaskType,
  AiTaskTypeSchema,
  type UpsertAiProviderConfig,
  UpsertAiProviderConfigSchema,
  type UpsertAiTaskRoute,
  UpsertAiTaskRouteSchema
} from '@edumenai/shared';
import { decryptSecret, encryptSecret, maskSecret } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';
import { prisma, TX_OPTIONS } from '../lib/prisma.js';

export const SUPPORTED_PROVIDERS: readonly AiProviderId[] = [
  'google',
  'openai',
  'anthropic',
  'openrouter'
] as const;

export const DEFAULT_PROVIDER_MODELS: Record<AiProviderId, string> = {
  google: 'gemini-3.5-flash',
  openai: 'gpt-4o',
  anthropic: 'claude-3-7-sonnet-latest',
  openrouter: 'google/gemini-2.5-flash'
};

export interface ResolvedTaskAiConfig {
  taskType: AiTaskType;
  provider: AiProviderId;
  model: string;
  apiKey: string;
  envVarName: string;
  baseUrl: string;
  maxTokens: number | null;
  temperature: number | null;
  reasoningConfig: Record<string, unknown> | null;
  extraConfig: Record<string, unknown> | null;
  routeSource: 'database' | 'env' | 'default';
  keySource: 'database' | 'env' | 'none';
}

export interface AiRuntimeTaskSummary {
  taskType: AiTaskType;
  provider: AiProviderId;
  model: string;
  routeSource: 'database' | 'env' | 'default';
  keySource: 'database' | 'env' | 'none';
  hasApiKey: boolean;
}

export interface AiRuntimeSummary {
  vision: AiRuntimeTaskSummary;
  evaluation: AiRuntimeTaskSummary;
  audio: AiRuntimeTaskSummary;
}

const PROVIDER_ALIASES: Record<string, AiProviderId> = {
  google: 'google',
  gemini: 'google',
  openai: 'openai',
  anthropic: 'anthropic',
  claude: 'anthropic',
  openrouter: 'openrouter'
};

const PROVIDER_KEY_ENV_MAP: Record<AiProviderId, readonly string[]> = {
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY']
};

const PROVIDER_MODEL_ENV_MAP: Record<AiProviderId, string> = {
  google: 'GEMINI_MODEL',
  openai: 'OPENAI_MODEL',
  anthropic: 'ANTHROPIC_MODEL',
  openrouter: 'OPENROUTER_MODEL'
};

export function normalizeProvider(rawProvider: string | null | undefined, fallback: AiProviderId = 'google'): AiProviderId {
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

function getEnvDefaultModelForProvider(provider: AiProviderId): string {
  const envVar = PROVIDER_MODEL_ENV_MAP[provider];
  const envModel = (process.env[envVar] || '').trim();
  return envModel || DEFAULT_PROVIDER_MODELS[provider];
}

export function getEnvProviderApiKey(provider: AiProviderId): { apiKey: string; envVarName: string } {
  const envVars = PROVIDER_KEY_ENV_MAP[provider];
  for (const envName of envVars) {
    const raw = (process.env[envName] || '').trim();
    if (raw) {
      const firstKey = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)[0];
      if (firstKey) {
        return { apiKey: firstKey, envVarName: envName };
      }
    }
  }
  return { apiKey: '', envVarName: envVars[0] || 'AI_API_KEY' };
}

export function getEnvProviderBaseUrl(provider: AiProviderId): string {
  const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');
  switch (provider) {
    case 'openai':
      return stripTrailingSlash(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
    case 'anthropic':
      return stripTrailingSlash(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1');
    case 'openrouter':
      return stripTrailingSlash(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1');
    case 'google':
    default:
      return '';
  }
}

function resolveEnvTaskRoute(taskType: AiTaskType): {
  provider: AiProviderId;
  model: string;
  routeSource: 'env' | 'default';
} {
  if (taskType === 'audio') {
    const rawAudioProvider = (process.env.AI_AUDIO_PROVIDER || '').trim();
    const rawAudioModel = (process.env.AI_AUDIO_MODEL || '').trim();
    const provider = normalizeProvider(rawAudioProvider, 'openai');
    const model =
      rawAudioModel ||
      (provider === 'openai' ? 'whisper-1' : getEnvDefaultModelForProvider(provider));
    return {
      provider,
      model,
      routeSource: rawAudioProvider || rawAudioModel ? 'env' : 'default'
    };
  }

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
    hasExplicitProvider ? explicitProviderRaw : globalProviderRaw || 'google'
  );

  // Only inherit global AI_MODEL when the task did not switch to a different provider
  let model = explicitModel.trim();
  if (!model && !hasExplicitProvider && globalModel) {
    model = globalModel;
  }
  if (!model) {
    model = getEnvDefaultModelForProvider(provider);
  }

  const envConfigured = Boolean(
    explicitProviderRaw.trim() ||
      explicitModel.trim() ||
      globalProviderRaw ||
      globalModel ||
      (process.env[PROVIDER_MODEL_ENV_MAP[provider]] || '').trim()
  );

  return {
    provider,
    model,
    routeSource: envConfigured ? 'env' : 'default'
  };
}

function toJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

async function resolveProviderCredentials(provider: AiProviderId): Promise<{
  apiKey: string;
  envVarName: string;
  baseUrl: string;
  extraConfig: Record<string, unknown> | null;
  keySource: 'database' | 'env' | 'none';
}> {
  const { apiKey: envKey, envVarName } = getEnvProviderApiKey(provider);
  const envBaseUrl = getEnvProviderBaseUrl(provider);

  try {
    const dbConfig = await prisma.aIProviderConfig.findFirst({
      where: { userId: null, provider }
    });

    if (dbConfig) {
      const baseUrl = (dbConfig.baseUrl || '').trim().replace(/\/+$/, '') || envBaseUrl;
      const extraConfig = toJsonRecord(dbConfig.extraConfig);

      if (dbConfig.isEnabled && dbConfig.apiKey.trim()) {
        const decrypted = decryptSecret(dbConfig.apiKey).trim();
        if (decrypted) {
          return {
            apiKey: decrypted,
            envVarName,
            baseUrl,
            extraConfig,
            keySource: 'database'
          };
        }
      }

      if (!dbConfig.isEnabled) {
        return {
          apiKey: '',
          envVarName,
          baseUrl,
          extraConfig,
          keySource: 'none'
        };
      }

      return {
        apiKey: envKey,
        envVarName,
        baseUrl,
        extraConfig,
        keySource: envKey ? 'env' : 'none'
      };
    }
  } catch (err) {
    logger.warn({ err, provider }, 'Failed reading AIProviderConfig from DB; falling back to .env');
  }

  return {
    apiKey: envKey,
    envVarName,
    baseUrl: envBaseUrl,
    extraConfig: null,
    keySource: envKey ? 'env' : 'none'
  };
}

export async function resolveTaskAiConfig(taskType: AiTaskType): Promise<ResolvedTaskAiConfig> {
  const validTask = AiTaskTypeSchema.parse(taskType);
  const envRoute = resolveEnvTaskRoute(validTask);

  let provider = envRoute.provider;
  let model = envRoute.model;
  let routeSource: 'database' | 'env' | 'default' = envRoute.routeSource;
  let maxTokens: number | null = null;
  let temperature: number | null = null;
  let reasoningConfig: Record<string, unknown> | null = null;

  try {
    const dbRoute = await prisma.aITaskRoute.findUnique({
      where: { taskType: validTask }
    });

    if (dbRoute && dbRoute.isActive) {
      provider = normalizeProvider(dbRoute.provider, envRoute.provider);
      model = dbRoute.model.trim() || envRoute.model;
      routeSource = 'database';
      maxTokens = dbRoute.maxTokens ?? null;
      temperature = dbRoute.temperature ?? null;
      reasoningConfig = toJsonRecord(dbRoute.reasoningConfig);
    }
  } catch (err) {
    logger.warn({ err, taskType: validTask }, 'Failed reading AITaskRoute from DB; falling back to .env');
  }

  const creds = await resolveProviderCredentials(provider);

  return {
    taskType: validTask,
    provider,
    model,
    apiKey: creds.apiKey,
    envVarName: creds.envVarName,
    baseUrl: creds.baseUrl,
    maxTokens,
    temperature,
    reasoningConfig,
    extraConfig: creds.extraConfig,
    routeSource,
    keySource: creds.keySource
  };
}

export async function getAiRuntimeSummary(): Promise<AiRuntimeSummary> {
  const [vision, evaluation, audio] = await Promise.all([
    resolveTaskAiConfig('vision'),
    resolveTaskAiConfig('evaluation'),
    resolveTaskAiConfig('audio')
  ]);

  const toSummary = (cfg: ResolvedTaskAiConfig): AiRuntimeTaskSummary => ({
    taskType: cfg.taskType,
    provider: cfg.provider,
    model: cfg.model,
    routeSource: cfg.routeSource,
    keySource: cfg.keySource,
    hasApiKey: Boolean(cfg.apiKey)
  });

  return {
    vision: toSummary(vision),
    evaluation: toSummary(evaluation),
    audio: toSummary(audio)
  };
}

function mapProviderView(
  provider: AiProviderId,
  dbRow: {
    id: string;
    apiKey: string;
    baseUrl: string | null;
    model: string | null;
    isDefault: boolean;
    isEnabled: boolean;
    extraConfig: unknown;
    updatedAt: Date;
  } | null
): AiProviderConfigView {
  const { apiKey: envKey } = getEnvProviderApiKey(provider);
  const envBaseUrl = getEnvProviderBaseUrl(provider);

  let dbKeyPlain = '';
  if (dbRow?.apiKey.trim()) {
    try {
      dbKeyPlain = decryptSecret(dbRow.apiKey).trim();
    } catch {
      dbKeyPlain = '';
    }
  }

  const hasDbKey = Boolean(dbKeyPlain);
  const hasEnvKey = Boolean(envKey);
  const source: 'database' | 'env' | 'none' = hasDbKey ? 'database' : hasEnvKey ? 'env' : 'none';
  const effectiveKey = hasDbKey ? dbKeyPlain : envKey;

  return {
    id: dbRow?.id,
    provider,
    hasApiKey: Boolean(effectiveKey),
    apiKeyMasked: maskSecret(effectiveKey),
    baseUrl: dbRow?.baseUrl ?? (envBaseUrl || null),
    model: dbRow?.model ?? null,
    isDefault: dbRow?.isDefault ?? false,
    isEnabled: dbRow?.isEnabled ?? true,
    extraConfig: toJsonRecord(dbRow?.extraConfig),
    source,
    updatedAt: dbRow ? dbRow.updatedAt.toISOString() : null
  };
}

export async function listAiProviderConfigs(): Promise<AiProviderConfigView[]> {
  const rows = await prisma.aIProviderConfig.findMany({
    where: { userId: null }
  });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return SUPPORTED_PROVIDERS.map((p) => mapProviderView(p, byProvider.get(p) ?? null));
}

export async function upsertAiProviderConfig(input: UpsertAiProviderConfig): Promise<AiProviderConfigView> {
  const parsed = UpsertAiProviderConfigSchema.parse(input);

  const saved = await prisma.$transaction(async (tx) => {
    if (parsed.isDefault === true) {
      await tx.aIProviderConfig.updateMany({
        where: { userId: null, provider: { not: parsed.provider } },
        data: { isDefault: false }
      });
    }

    const existing = await tx.aIProviderConfig.findFirst({
      where: { userId: null, provider: parsed.provider }
    });

    const trimmedNewKey = parsed.apiKey !== undefined ? parsed.apiKey.trim() : undefined;
    const encryptedKey =
      trimmedNewKey && trimmedNewKey.length > 0
        ? encryptSecret(trimmedNewKey)
        : (existing?.apiKey ?? '');

    if (existing) {
      return tx.aIProviderConfig.update({
        where: { id: existing.id },
        data: {
          apiKey: encryptedKey,
          ...(parsed.baseUrl !== undefined ? { baseUrl: parsed.baseUrl } : {}),
          ...(parsed.model !== undefined ? { model: parsed.model } : {}),
          ...(parsed.isDefault !== undefined ? { isDefault: parsed.isDefault } : {}),
          ...(parsed.isEnabled !== undefined ? { isEnabled: parsed.isEnabled } : {}),
          ...(parsed.extraConfig !== undefined
            ? { extraConfig: parsed.extraConfig as never }
            : {})
        }
      });
    }

    return tx.aIProviderConfig.create({
      data: {
        userId: null,
        provider: parsed.provider,
        apiKey: encryptedKey,
        baseUrl: parsed.baseUrl ?? null,
        model: parsed.model ?? null,
        isDefault: parsed.isDefault ?? false,
        isEnabled: parsed.isEnabled ?? true,
        extraConfig: (parsed.extraConfig ?? undefined) as never
      }
    });
  }, TX_OPTIONS);

  return mapProviderView(parsed.provider, saved);
}

export async function listAiTaskRoutes(): Promise<AiTaskRouteView[]> {
  const dbRoutes = await prisma.aITaskRoute.findMany();
  const byTask = new Map(dbRoutes.map((r) => [r.taskType, r]));
  const tasks: readonly AiTaskType[] = ['vision', 'evaluation', 'audio'];

  return tasks.map((taskType) => {
    const dbRow = byTask.get(taskType);
    if (dbRow && dbRow.isActive) {
      return {
        id: dbRow.id,
        taskType,
        provider: normalizeProvider(dbRow.provider),
        model: dbRow.model,
        maxTokens: dbRow.maxTokens,
        temperature: dbRow.temperature,
        reasoningConfig: toJsonRecord(dbRow.reasoningConfig),
        isActive: dbRow.isActive,
        source: 'database',
        updatedAt: dbRow.updatedAt.toISOString()
      };
    }

    const envRoute = resolveEnvTaskRoute(taskType);
    return {
      id: dbRow?.id,
      taskType,
      provider: envRoute.provider,
      model: envRoute.model,
      maxTokens: dbRow?.maxTokens ?? null,
      temperature: dbRow?.temperature ?? null,
      reasoningConfig: toJsonRecord(dbRow?.reasoningConfig),
      isActive: true,
      source: envRoute.routeSource,
      updatedAt: dbRow ? dbRow.updatedAt.toISOString() : null
    };
  });
}

export async function upsertAiTaskRoute(input: UpsertAiTaskRoute): Promise<AiTaskRouteView> {
  const parsed = UpsertAiTaskRouteSchema.parse(input);
  const saved = await prisma.aITaskRoute.upsert({
    where: { taskType: parsed.taskType },
    create: {
      taskType: parsed.taskType,
      provider: parsed.provider,
      model: parsed.model.trim(),
      maxTokens: parsed.maxTokens ?? null,
      temperature: parsed.temperature ?? null,
      reasoningConfig: (parsed.reasoningConfig ?? undefined) as never,
      isActive: parsed.isActive ?? true
    },
    update: {
      provider: parsed.provider,
      model: parsed.model.trim(),
      ...(parsed.maxTokens !== undefined ? { maxTokens: parsed.maxTokens } : {}),
      ...(parsed.temperature !== undefined ? { temperature: parsed.temperature } : {}),
      ...(parsed.reasoningConfig !== undefined
        ? { reasoningConfig: (parsed.reasoningConfig ?? null) as never }
        : {}),
      isActive: parsed.isActive ?? true
    }
  });

  return {
    id: saved.id,
    taskType: AiTaskTypeSchema.parse(saved.taskType),
    provider: AiProviderIdSchema.parse(saved.provider),
    model: saved.model,
    maxTokens: saved.maxTokens,
    temperature: saved.temperature,
    reasoningConfig: toJsonRecord(saved.reasoningConfig),
    isActive: saved.isActive,
    source: saved.isActive ? 'database' : 'env',
    updatedAt: saved.updatedAt.toISOString()
  };
}

export async function deleteAiTaskRoute(taskType: AiTaskType): Promise<{
  deleted: boolean;
  taskType: AiTaskType;
  activeRoute: AiTaskRouteView;
}> {
  const validTask = AiTaskTypeSchema.parse(taskType);
  const existing = await prisma.aITaskRoute.findUnique({ where: { taskType: validTask } });
  if (existing) {
    await prisma.aITaskRoute.delete({ where: { taskType: validTask } });
  }

  const envRoute = resolveEnvTaskRoute(validTask);
  return {
    deleted: Boolean(existing),
    taskType: validTask,
    activeRoute: {
      taskType: validTask,
      provider: envRoute.provider,
      model: envRoute.model,
      maxTokens: null,
      temperature: null,
      reasoningConfig: null,
      isActive: true,
      source: envRoute.routeSource,
      updatedAt: null
    }
  };
}

export async function testAiProviderConnection(providerInput: AiProviderId): Promise<{
  ok: boolean;
  provider: AiProviderId;
  model: string;
  latencyMs: number;
  message: string;
}> {
  const provider = AiProviderIdSchema.parse(providerInput);
  const creds = await resolveProviderCredentials(provider);

  const dbRow = await prisma.aIProviderConfig
    .findFirst({ where: { userId: null, provider }, select: { model: true } })
    .catch(() => null);
  const model = dbRow?.model?.trim() || getEnvDefaultModelForProvider(provider);

  if (!creds.apiKey) {
    return {
      ok: false,
      provider,
      model,
      latencyMs: 0,
      message: `No API key configured for ${provider} (${creds.envVarName}).`
    };
  }

  const start = Date.now();
  const timeoutSignal = AbortSignal.timeout(15000);

  try {
    let url: string;
    const headers: Record<string, string> = {};

    switch (provider) {
      case 'google': {
        url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1';
        headers['x-goog-api-key'] = creds.apiKey;
        break;
      }
      case 'openai': {
        url = `${creds.baseUrl}/models`;
        headers.Authorization = `Bearer ${creds.apiKey}`;
        break;
      }
      case 'openrouter': {
        url = `${creds.baseUrl}/models`;
        headers.Authorization = `Bearer ${creds.apiKey}`;
        break;
      }
      case 'anthropic': {
        url = `${creds.baseUrl}/models`;
        headers['x-api-key'] = creds.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        break;
      }
    }

    const res = await fetch(url, { method: 'GET', headers, signal: timeoutSignal });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        provider,
        model,
        latencyMs,
        message: `Provider returned HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`
      };
    }

    return {
      ok: true,
      provider,
      model,
      latencyMs,
      message: `Connected to ${provider} successfully (${latencyMs}ms).`
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      provider,
      model,
      latencyMs,
      message: `Connection failed: ${msg}`
    };
  }
}
