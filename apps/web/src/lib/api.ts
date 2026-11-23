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
  options: RequestInit = {}
): Promise<T> {
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  const res = await fetch(getApiUrl(path), {
    ...options,
    headers: {
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

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

export async function fetchPublishedExercises(): Promise<PublishedExerciseSummary[]> {
  const res = await apiFetch<{ success: true; data: PublishedExerciseSummary[] }>('/api/exercises');
  return res.data;
}

export async function fetchPublishedExercise(code: string): Promise<PublishedExerciseDetail> {
  const res = await apiFetch<{ success: true; data: PublishedExerciseDetail }>(
    `/api/exercises/${encodeURIComponent(code)}`
  );
  return res.data;
}

export async function runExerciseOcr(
  code: string,
  params: { file: File; promptKey: string; versionId?: string; isPreview?: boolean }
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

  const res = await apiFetch<{ success: true; data: DynamicOcrResponseData }>(
    `/api/exercises/${encodeURIComponent(code)}/ocr`,
    {
      method: 'POST',
      body: formData
    }
  );
  return res.data;
}

export async function runExerciseEvaluate(
  code: string,
  payload: EvaluateRequest
): Promise<EvaluatePersistedResponse['data']> {
  const res = await apiFetch<EvaluatePersistedResponse>(
    `/api/exercises/${encodeURIComponent(code)}/evaluate`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
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
        body: formData
      }
    );
    return res.data;
  }

  const res = await apiFetch<{ success: true; data: TelegramDispatchResult }>(
    `/api/reports/${encodeURIComponent(reportId)}/send-telegram`,
    {
      method: 'POST',
      body: JSON.stringify({})
    }
  );
  return res.data;
}
