import type { AiProviderId, AiTaskType } from '@edumenai/shared';

export const PROVIDER_DISPLAY_NAMES: Record<AiProviderId, string> = {
  google: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  openrouter: 'OpenRouter'
};

export interface AiFilePayload {
  base64: string;
  mimeType: string;
  filename: string;
}

export interface AiUsageMetrics {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
}

export interface AiAdapterParams {
  provider: AiProviderId;
  taskType: AiTaskType;
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  file: AiFilePayload | null;
  files?: AiFilePayload[] | null;
  jsonSchema: Record<string, unknown> | null;
  schemaName: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  reasoningConfig?: Record<string, unknown> | null;
  extraConfig?: Record<string, unknown> | null;
}

export interface AiAdapterResult {
  text: string;
  finishReason: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface AiServiceErrorOptions {
  message: string;
  statusCode?: number;
  code?: string;
  provider?: string;
  model?: string;
  taskType?: string;
  isQuotaError?: boolean;
  retryAfter?: string | null;
  cause?: unknown;
}

export class AiServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly provider: string;
  readonly model: string;
  readonly taskType: string;
  readonly isQuotaError: boolean;
  readonly retryAfter: string | null;

  constructor({
    message,
    statusCode = 500,
    code = 'AI_SERVICE_ERROR',
    provider = 'unknown',
    model = 'unknown',
    taskType = 'unknown',
    isQuotaError = false,
    retryAfter = null,
    cause = null
  }: AiServiceErrorOptions) {
    super(message);
    this.name = 'AiServiceError';
    this.statusCode = statusCode;
    this.code = code;
    this.provider = provider;
    this.model = model;
    this.taskType = taskType;
    this.isQuotaError = isQuotaError;
    this.retryAfter = retryAfter;
    if (cause) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export class HttpJsonError extends Error {
  statusCode: number;
  error: unknown;

  constructor(message: string, statusCode: number, error: unknown) {
    super(message);
    this.name = 'HttpJsonError';
    this.statusCode = statusCode;
    this.error = error;
  }
}

export async function postJsonRequest(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const rawBody = await response.text();
  let parsedBody: Record<string, unknown> = {};
  try {
    parsedBody = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    parsedBody = { rawBody };
  }

  if (!response.ok) {
    const nestedError = parsedBody.error as Record<string, unknown> | undefined;
    const msg =
      (typeof nestedError?.message === 'string' && nestedError.message) ||
      (typeof parsedBody.message === 'string' && parsedBody.message) ||
      rawBody ||
      `HTTP ${response.status}`;
    throw new HttpJsonError(msg, response.status, nestedError ?? parsedBody);
  }

  return parsedBody;
}

interface RawErrorShape {
  name?: string;
  statusCode?: unknown;
  status?: unknown;
  code?: unknown;
  message?: unknown;
  error?: {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };
}

function extractErrorDetails(
  err: unknown,
  explicitStatus: number | null = null
): { status: number | null; message: string; fullText: string } {
  const shape = (err && typeof err === 'object' ? err : {}) as RawErrorShape;
  const status =
    Number(
      explicitStatus ||
        shape.statusCode ||
        shape.status ||
        shape.code ||
        shape.error?.code ||
        shape.error?.status ||
        0
    ) || null;

  let serialized = '';
  try {
    serialized = typeof err === 'string' ? err : JSON.stringify(err);
  } catch {
    serialized = '';
  }

  const message = String(
    shape.error?.message || shape.message || serialized || 'Unknown AI provider error'
  );

  return { status, message, fullText: `${message} ${serialized}`.toLowerCase() };
}

function extractRetryHint(text: string): string | null {
  const hMatch = text.match(/retry in ([0-9]+h[0-9]+m)/i);
  if (hMatch) return hMatch[1];
  const sMatch = text.match(/"retrydelay":\s*"([0-9]+s)"/i);
  if (sMatch) return sMatch[1];
  return null;
}

export function classifyAiProviderError(
  provider: string,
  model: string,
  taskType: string,
  err: unknown,
  explicitStatus: number | null = null
): AiServiceError {
  if (err instanceof AiServiceError) return err;

  const providerLabel =
    (PROVIDER_DISPLAY_NAMES as Record<string, string>)[provider] || provider;
  const { status, message, fullText } = extractErrorDetails(err, explicitStatus);
  const errName = err instanceof Error ? err.name : '';

  if (errName === 'AbortError' || errName === 'TimeoutError' || fullText.includes('timed out')) {
    return new AiServiceError({
      message: `The AI request timed out on ${providerLabel} (${model}). Please try again.`,
      statusCode: 504,
      code: 'AI_TIMEOUT',
      provider,
      model,
      taskType,
      cause: err
    });
  }

  const isQuotaOrBilling =
    status === 429 ||
    status === 402 ||
    fullText.includes('resource_exhausted') ||
    fullText.includes('quota exceeded') ||
    fullText.includes('exceeded your current quota') ||
    fullText.includes('insufficient_quota') ||
    fullText.includes('billing_hard_limit_reached') ||
    fullText.includes('credit balance is too low') ||
    fullText.includes('insufficient credits') ||
    fullText.includes('more credits') ||
    fullText.includes('rate_limit_exceeded') ||
    fullText.includes('rate_limit_error') ||
    fullText.includes('free_tier_requests') ||
    fullText.includes('usage limits');

  if (isQuotaOrBilling) {
    const retryAfter = extractRetryHint(fullText);
    return new AiServiceError({
      message: `AI service quota or billing balance has been exhausted on ${providerLabel} (${model}). To preserve marking quality, automatic downgrade is disabled—please recharge your API balance or enable Pay-as-you-go billing on ${providerLabel} to restore service.`,
      statusCode: 429,
      code: 'QUOTA_EXCEEDED',
      provider,
      model,
      taskType,
      isQuotaError: true,
      retryAfter,
      cause: err
    });
  }

  if (
    status === 401 ||
    status === 403 ||
    fullText.includes('invalid_api_key') ||
    fullText.includes('authentication_error') ||
    fullText.includes('api key not valid') ||
    fullText.includes('incorrect api key')
  ) {
    return new AiServiceError({
      message: `Authentication failed for ${providerLabel} (${model}). Please verify the API key configured in settings or .env.`,
      statusCode: 500,
      code: 'INVALID_API_KEY',
      provider,
      model,
      taskType,
      cause: err
    });
  }

  if (
    status === 404 ||
    fullText.includes('model_not_found') ||
    fullText.includes('does not exist') ||
    fullText.includes('is not found') ||
    fullText.includes('is not supported for')
  ) {
    return new AiServiceError({
      message: `Configured model '${model}' was not found or is unsupported on ${providerLabel}. Please check your model settings.`,
      statusCode: 500,
      code: 'MODEL_NOT_FOUND',
      provider,
      model,
      taskType,
      cause: err
    });
  }

  if (
    status === 503 ||
    status === 529 ||
    fullText.includes('unavailable') ||
    fullText.includes('high demand') ||
    fullText.includes('overloaded')
  ) {
    return new AiServiceError({
      message: `${providerLabel} (${model}) is currently experiencing high traffic. Please retry in a few moments.`,
      statusCode: 503,
      code: 'PROVIDER_OVERLOADED',
      provider,
      model,
      taskType,
      cause: err
    });
  }

  return new AiServiceError({
    message: `${providerLabel} (${model}) error: ${message}`,
    statusCode: status && status >= 400 && status < 600 ? status : 500,
    code: 'AI_PROVIDER_ERROR',
    provider,
    model,
    taskType,
    cause: err
  });
}
