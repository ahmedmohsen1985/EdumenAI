import type {
  AiTaskType,
  EvaluatePersistedResponse,
  EvaluateRequest,
  ExerciseSkill,
  ListReportsResponse,
  PersistedReport,
  TemplateConfig,
  TranscriptionMeta
} from '@edumenai/shared';
import { fetchWithCache } from './client-cache';

/**
 * Runtime API client for browser and server-side calls.
 *
 * In the browser this points to NEXT_PUBLIC_API_URL.
 * On the server (SSR / Route Handlers) this resolves API_INTERNAL_URL,
 * falling back to NEXT_PUBLIC_API_URL or http://localhost:4000.
 */

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return (
      process.env.API_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:4000'
    );
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return '';
}

export function getApiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly isQuotaError?: boolean;

  constructor(message: string, status: number, code?: string, isQuotaError?: boolean) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.isQuotaError = isQuotaError;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 25_000, signal: externalSignal, ...fetchOptions } = options;
  const isFormData =
    typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;

  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = (): void => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timerId =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  let res: Response;
  try {
    res = await fetch(getApiUrl(path), {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...(fetchOptions.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...fetchOptions.headers
      }
    });
  } catch (err: unknown) {
    if (timedOut && !(externalSignal?.aborted)) {
      throw new ApiError(
        'Request timed out. Please verify the API server is running and try again.',
        408,
        'TIMEOUT'
      );
    }
    throw err;
  } finally {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }

  const data = (await res.json().catch(() => null)) as {
    error?: string;
    code?: string;
    isQuotaError?: boolean;
  } | null;

  if (!res.ok) {
    throw new ApiError(
      data?.error || `API request failed: ${res.status}`,
      res.status,
      data?.code,
      data?.isQuotaError
    );
  }

  return data as T;
}

export interface PublicPromptMeta {
  key: string;
  label: string;
  description?: string;
  taskType: AiTaskType;
}

export interface PublishedExerciseSummary {
  id: string;
  code: string;
  skill: ExerciseSkill;
  title: string;
  description: string | null;
  totalMarks: number;
  activeVersion: {
    id: string;
    version: number;
    publishedAt: string | null;
  };
}

export interface PublishedExerciseDetail extends PublishedExerciseSummary {
  templateSchema: TemplateConfig;
  promptMeta: PublicPromptMeta[];
}

export interface DynamicOcrResponseData {
  text: string;
  mimeType: string;
  promptKey: string;
  transcriptionMeta: TranscriptionMeta | null;
  provider: string;
  model: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    latencyMs: number | null;
  };
  latencyMs: number | null;
}

export interface TelegramDispatchResult {
  targets: Array<{
    chatId: string;
    ok: boolean;
    error?: string;
  }>;
  student: {
    ok: boolean;
    error?: string;
  } | null;
}

export const PUBLIC_CACHE_KEYS = {
  publishedExercises: 'pub:exercises',
  publishedExercise: (code: string) => `pub:exercise:${code}`
} as const;

export async function fetchPublishedExercises(options?: {
  force?: boolean;
}): Promise<PublishedExerciseSummary[]> {
  return fetchWithCache(
    PUBLIC_CACHE_KEYS.publishedExercises,
    async () => {
      const res = await apiFetch<{ success: true; data: PublishedExerciseSummary[] }>(
        '/api/exercises'
      );
      return res.data;
    },
    { ttlMs: 30_000, force: options?.force }
  );
}

export async function fetchPublishedExercise(
  code: string,
  options?: { force?: boolean }
): Promise<PublishedExerciseDetail> {
  return fetchWithCache(
    PUBLIC_CACHE_KEYS.publishedExercise(code),
    async () => {
      const res = await apiFetch<{ success: true; data: PublishedExerciseDetail }>(
        `/api/exercises/${encodeURIComponent(code)}`
      );
      return res.data;
    },
    { ttlMs: 30_000, force: options?.force }
  );
}

export async function runExerciseOcr(
  code: string,
  params: {
    file: File;
    promptKey: string;
    versionId?: string;
    isPreview?: boolean;
    adminKey?: string;
  }
): Promise<DynamicOcrResponseData> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('promptKey', params.promptKey);
  if (params.versionId) {
    formData.append('versionId', params.versionId);
  }
  if (params.isPreview !== undefined) {
    formData.append('isPreview', String(params.isPreview));
  }

  const trimmedKey = params.adminKey?.trim();
  const res = await apiFetch<{ success: true; data: DynamicOcrResponseData }>(
    `/api/exercises/${encodeURIComponent(code)}/ocr`,
    {
      method: 'POST',
      body: formData,
      timeoutMs: 130_000,
      ...(trimmedKey ? { headers: { 'x-admin-key': trimmedKey } } : {})
    }
  );
  return res.data;
}

export async function runExerciseEvaluate(
  code: string,
  payload: EvaluateRequest,
  options?: { adminKey?: string }
): Promise<EvaluatePersistedResponse['data']> {
  const trimmedKey = options?.adminKey?.trim();
  const res = await apiFetch<EvaluatePersistedResponse>(
    `/api/exercises/${encodeURIComponent(code)}/evaluate`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 130_000,
      ...(trimmedKey ? { headers: { 'x-admin-key': trimmedKey } } : {})
    }
  );
  return res.data;
}

export async function fetchReports(params?: {
  exerciseCode?: string;
  limit?: number;
  offset?: number;
}): Promise<ListReportsResponse['data']> {
  const search = new URLSearchParams();
  if (params?.exerciseCode) search.set('exerciseCode', params.exerciseCode);
  if (params?.limit !== undefined) search.set('limit', String(params.limit));
  if (params?.offset !== undefined) search.set('offset', String(params.offset));
  const query = search.toString();
  const path = query ? `/api/reports?${query}` : '/api/reports';
  const res = await apiFetch<ListReportsResponse>(path);
  return res.data;
}

export async function fetchReportById(id: string): Promise<PersistedReport> {
  const res = await apiFetch<{ success: true; data: PersistedReport }>(
    `/api/reports/${encodeURIComponent(id)}`
  );
  return res.data;
}

export async function sendReportToTelegram(
  reportId: string,
  params?: { pdfBlob?: Blob; fileName?: string }
): Promise<TelegramDispatchResult> {
  if (params?.pdfBlob) {
    const formData = new FormData();
    const fileName = params.fileName || `EdumenAI_Report_${reportId}.pdf`;
    formData.append('pdf', params.pdfBlob, fileName);
    const res = await apiFetch<{ success: true; data: TelegramDispatchResult }>(
      `/api/reports/${encodeURIComponent(reportId)}/send-telegram`,
      {
        method: 'POST',
        body: formData,
        timeoutMs: 130_000
      }
    );
    return res.data;
  }

  const res = await apiFetch<{ success: true; data: TelegramDispatchResult }>(
    `/api/reports/${encodeURIComponent(reportId)}/send-telegram`,
    {
      method: 'POST',
      body: JSON.stringify({}),
      timeoutMs: 130_000
    }
  );
  return res.data;
}
