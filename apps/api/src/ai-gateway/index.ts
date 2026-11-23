import { type AiProviderId, type AiTaskType } from '@edumenai/shared';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { resolveTaskAiConfig } from '../services/ai-settings.service.js';
import { callAnthropicAdapter } from './adapters/anthropic.adapter.js';
import { callGoogleAdapter, getGoogleClient } from './adapters/google.adapter.js';
import { callOpenAiAdapter } from './adapters/openai.adapter.js';
import { callOpenRouterAdapter } from './adapters/openrouter.adapter.js';
import {
  AiServiceError,
  classifyAiProviderError,
  PROVIDER_DISPLAY_NAMES,
  type AiAdapterParams,
  type AiAdapterResult,
  type AiFilePayload,
  type AiUsageMetrics
} from './errors/ai-gateway.error.js';

export {
  AiServiceError,
  classifyAiProviderError,
  PROVIDER_DISPLAY_NAMES,
  type AiAdapterParams,
  type AiAdapterResult,
  type AiFilePayload,
  type AiUsageMetrics
};

const PROVIDER_ADAPTERS: Record<AiProviderId, (params: AiAdapterParams) => Promise<AiAdapterResult>> = {
  google: callGoogleAdapter,
  openai: callOpenAiAdapter,
  openrouter: callOpenRouterAdapter,
  anthropic: callAnthropicAdapter
};

function resolveMaxOutputTokens(
  provider: AiProviderId,
  taskType: AiTaskType,
  explicitMax?: number | null,
  routeMax?: number | null
): number {
  if (typeof explicitMax === 'number' && explicitMax > 0) return explicitMax;
  if (typeof routeMax === 'number' && routeMax > 0) return routeMax;

  if (taskType === 'evaluation') {
    const envMax = Number(process.env.AI_EVAL_MAX_TOKENS || 0);
    if (envMax > 0) return envMax;
    return provider === 'anthropic' ? 8192 : 16384;
  }
  if (taskType === 'vision') {
    const envVisionMax = Number(process.env.AI_VISION_MAX_TOKENS || 0);
    if (envVisionMax > 0) return envVisionMax;
    return provider === 'anthropic' ? 8192 : 16384;
  }
  return 4096;
}

export interface InvokeAiModelParams {
  taskType?: AiTaskType;
  operationName?: string;
  systemPrompt?: string;
  userPrompt?: string;
  file?: AiFilePayload | null;
  jsonSchema?: Record<string, unknown> | null;
  schemaName?: string;
  temperature?: number;
  maxOutputTokens?: number | null;
}

export interface InvokeAiModelResult {
  text: string;
  finishReason: string;
  provider: AiProviderId;
  model: string;
  usage: AiUsageMetrics;
  latencyMs: number;
}

export function isLengthTruncated(finishReason: string | null | undefined): boolean {
  const norm = String(finishReason || '').trim().toLowerCase();
  return norm === 'length' || norm === 'max_tokens';
}

export async function invokeAiModel({
  taskType = 'evaluation',
  operationName = 'AiOperation',
  systemPrompt = '',
  userPrompt = '',
  file = null,
  jsonSchema = null,
  schemaName = 'marking_report',
  temperature = 0.0,
  maxOutputTokens = null
}: InvokeAiModelParams): Promise<InvokeAiModelResult> {
  const resolved = await resolveTaskAiConfig(taskType);
  const { provider, model, apiKey, envVarName, baseUrl, reasoningConfig, extraConfig } = resolved;
  const providerLabel = PROVIDER_DISPLAY_NAMES[provider] || provider;

  if (!apiKey) {
    throw new AiServiceError({
      message: `${providerLabel} API key (${envVarName}) is not configured in settings or .env for ${taskType} tasks.`,
      statusCode: 500,
      code: 'MISSING_API_KEY',
      provider,
      model,
      taskType
    });
  }

  const adapter = PROVIDER_ADAPTERS[provider];
  if (!adapter) {
    throw new AiServiceError({
      message: `No adapter implemented for AI provider '${provider}'.`,
      statusCode: 500,
      code: 'UNSUPPORTED_PROVIDER',
      provider,
      model,
      taskType
    });
  }

  const effectiveMaxTokens = resolveMaxOutputTokens(
    provider,
    taskType,
    maxOutputTokens,
    resolved.maxTokens
  );
  const effectiveTemperature = resolved.temperature ?? temperature;
  const keyTail = apiKey.length > 6 ? apiKey.slice(-6) : 'KEY';

  logger.info(
    {
      taskType,
      operationName,
      provider,
      model,
      routeSource: resolved.routeSource,
      keySource: resolved.keySource,
      keyTail,
      maxTokens: effectiveMaxTokens
    },
    `[AI Gateway] [${taskType.toUpperCase()}] ${operationName}: invoking '${model}' on ${providerLabel}`
  );

  const startedAt = Date.now();
  try {
    const rawOutput = await adapter({
      provider,
      taskType,
      apiKey,
      baseUrl,
      model,
      systemPrompt,
      userPrompt,
      file,
      jsonSchema,
      schemaName,
      temperature: effectiveTemperature,
      maxOutputTokens: effectiveMaxTokens,
      timeoutMs: env.aiTimeoutMs,
      reasoningConfig,
      extraConfig
    });

    const latencyMs = Date.now() - startedAt;
    const text = String(rawOutput.text || '').trim();
    const finishReason = rawOutput.finishReason || 'stop';

    logger.info(
      { taskType, operationName, provider, model, finishReason, latencyMs },
      `[AI Gateway] [${taskType.toUpperCase()}] ${operationName} succeeded`
    );

    return {
      text,
      finishReason,
      provider,
      model,
      latencyMs,
      usage: {
        promptTokens: rawOutput.promptTokens,
        completionTokens: rawOutput.completionTokens,
        totalTokens: rawOutput.totalTokens,
        latencyMs
      }
    };
  } catch (err) {
    const classified = classifyAiProviderError(provider, model, taskType, err);
    logger.error(
      {
        taskType,
        operationName,
        provider,
        model,
        code: classified.code,
        statusCode: classified.statusCode,
        message: classified.message
      },
      `[AI Gateway] [${taskType.toUpperCase()}] ${operationName} failed`
    );
    throw classified;
  }
}

export interface TranscribeAudioParams {
  fileBuffer: Buffer;
  mimeType: string;
  filename?: string;
  language?: string;
  prompt?: string;
}

export interface TranscribeAudioResult {
  text: string;
  provider: AiProviderId;
  model: string;
  usage: AiUsageMetrics;
  latencyMs: number;
}

export async function transcribeAudio({
  fileBuffer,
  mimeType,
  filename = 'audio.mp3',
  language,
  prompt
}: TranscribeAudioParams): Promise<TranscribeAudioResult> {
  const resolved = await resolveTaskAiConfig('audio');
  const { provider, model, apiKey, envVarName, baseUrl } = resolved;
  const providerLabel = PROVIDER_DISPLAY_NAMES[provider] || provider;

  if (!apiKey) {
    throw new AiServiceError({
      message: `${providerLabel} API key (${envVarName}) is not configured in settings or .env for audio tasks.`,
      statusCode: 500,
      code: 'MISSING_API_KEY',
      provider,
      model,
      taskType: 'audio'
    });
  }

  const startedAt = Date.now();
  try {
    if (provider === 'google') {
      const ai = getGoogleClient(apiKey);
      const response = await ai.models.generateContent({
        model,
        contents: [
          { inlineData: { data: fileBuffer.toString('base64'), mimeType } },
          {
            text:
              prompt?.trim() ||
              'Transcribe the audio verbatim as clean plain text without adding commentary.'
          }
        ],
        config: {
          temperature: 0,
          abortSignal: AbortSignal.timeout(env.aiTimeoutMs)
        }
      });

      const latencyMs = Date.now() - startedAt;
      const usageMeta = response.usageMetadata;
      const usage: AiUsageMetrics = {
        promptTokens:
          typeof usageMeta?.promptTokenCount === 'number' ? usageMeta.promptTokenCount : null,
        completionTokens:
          typeof usageMeta?.candidatesTokenCount === 'number'
            ? usageMeta.candidatesTokenCount
            : null,
        totalTokens:
          typeof usageMeta?.totalTokenCount === 'number' ? usageMeta.totalTokenCount : null,
        latencyMs
      };

      return {
        text: (response.text || '').trim(),
        provider,
        model,
        usage,
        latencyMs
      };
    }

    if (provider === 'openai' || provider === 'openrouter') {
      const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
      const url = `${cleanBaseUrl}/audio/transcriptions`;
      const formData = new FormData();
      formData.append('file', new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), filename);
      formData.append('model', model);
      if (language) formData.append('language', language);
      if (prompt) formData.append('prompt', prompt);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: formData,
        signal: AbortSignal.timeout(env.aiTimeoutMs)
      });

      const rawText = await response.text();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        parsed = { text: rawText };
      }

      if (!response.ok) {
        const err = new Error(
          typeof (parsed.error as Record<string, unknown> | undefined)?.message === 'string'
            ? String((parsed.error as Record<string, unknown>).message)
            : rawText || `HTTP ${response.status}`
        ) as Error & { statusCode?: number; error?: unknown };
        err.statusCode = response.status;
        err.error = parsed.error ?? parsed;
        throw err;
      }

      const latencyMs = Date.now() - startedAt;
      const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
      return {
        text,
        provider,
        model,
        latencyMs,
        usage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          latencyMs
        }
      };
    }

    throw new AiServiceError({
      message: `Audio transcription is not supported on ${providerLabel}. Use OpenAI (whisper-1) or Google Gemini.`,
      statusCode: 400,
      code: 'UNSUPPORTED_AUDIO_PROVIDER',
      provider,
      model,
      taskType: 'audio'
    });
  } catch (err) {
    throw classifyAiProviderError(provider, model, 'audio', err);
  }
}
