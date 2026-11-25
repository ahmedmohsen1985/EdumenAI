import type {
  AdminUserView,
  AiTaskType,
  AuthUserView,
  ChangePasswordRequest,
  CreateUserAdminRequest,
  EnrollmentView,
  NotificationView,
  PublicInstructorView,
  RegisterRequest,
  RequestEnrollmentRequest,
  RespondEnrollmentRequest,
  UpdateProfileRequest,
  UpdateUserAdminRequest,
  UserRole,
  AccountStatus,
  EvaluatePersistedResponse,
  EvaluateRequest,
  ExerciseSkill,
  ListReportsResponse,
  PersistedReport,
  TemplateConfig,
  TranscriptionMeta
} from '@edumenai/shared';
import { fetchWithCache, invalidateCache } from './client-cache';
import { getAdminAuthHeaders } from './admin-auth';

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
      credentials: fetchOptions.credentials ?? 'include',
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
  owner?: { id: string; name: string | null; school: string | null } | null;
  integrityEnabled?: boolean;
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


/* -------------------------------------------------------------------------- */
/*  Auth, Profiles, Enrollments, Notifications & Admin Users                  */
/* -------------------------------------------------------------------------- */

/**
 * Accepts both bare payloads (`{ user }`) and `{ success: true, data }`
 * envelopes so the client works with either backend response style.
 */
function unwrapData<T>(res: unknown): T {
  if (
    typeof res === 'object' &&
    res !== null &&
    'success' in res &&
    'data' in res &&
    (res as { success: unknown }).success === true
  ) {
    return (res as { data: T }).data;
  }
  return res as T;
}

/** Exercise visibility depends on the session, so drop cached public lists. */
export function invalidatePublishedExerciseCache(): void {
  invalidateCache('pub:');
}

export interface AuthSessionPayload {
  user: AuthUserView | null;
  approvedInstructors: PublicInstructorView[];
  pendingInstructorCount: number;
  unreadNotificationCount: number;
}

export interface NotificationsPayload {
  items: NotificationView[];
  unreadCount: number;
}

export interface AdminUsersQuery {
  role?: UserRole | '';
  accountStatus?: AccountStatus | '';
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AdminUsersPayload {
  items: AdminUserView[];
  total: number;
}

export async function fetchAuthSession(): Promise<AuthSessionPayload> {
  const res = await apiFetch<unknown>('/api/auth/me');
  const data = unwrapData<Partial<AuthSessionPayload>>(res);
  return {
    user: data.user ?? null,
    approvedInstructors: data.approvedInstructors ?? [],
    pendingInstructorCount: data.pendingInstructorCount ?? 0,
    unreadNotificationCount: data.unreadNotificationCount ?? 0
  };
}

export async function fetchPublicInstructors(): Promise<PublicInstructorView[]> {
  const res = await apiFetch<unknown>('/api/auth/instructors');
  return unwrapData<PublicInstructorView[]>(res);
}

export async function registerAccount(payload: RegisterRequest): Promise<AuthUserView> {
  const res = await apiFetch<unknown>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  invalidatePublishedExerciseCache();
  invalidateCache('admin:');
  return unwrapData<{ user: AuthUserView }>(res).user;
}

export async function loginAccount(payload: {
  email: string;
  password: string;
}): Promise<AuthUserView> {
  const res = await apiFetch<unknown>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  invalidatePublishedExerciseCache();
  invalidateCache('admin:');
  return unwrapData<{ user: AuthUserView }>(res).user;
}

export async function logoutAccount(): Promise<void> {
  try {
    await apiFetch<unknown>('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
  } finally {
    invalidatePublishedExerciseCache();
    invalidateCache('admin:');
  }
}

export async function requestPasswordReset(email: string): Promise<string> {
  const res = await apiFetch<unknown>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
  return unwrapData<{ message?: string }>(res).message ?? '';
}

export async function resetPassword(payload: {
  token: string;
  password: string;
}): Promise<string> {
  const res = await apiFetch<unknown>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return unwrapData<{ message?: string }>(res).message ?? '';
}

export async function updateMyProfile(payload: UpdateProfileRequest): Promise<AuthUserView> {
  const res = await apiFetch<unknown>('/api/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  invalidatePublishedExerciseCache();
  return unwrapData<{ user: AuthUserView }>(res).user;
}

export async function changeMyPassword(payload: ChangePasswordRequest): Promise<void> {
  await apiFetch<unknown>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchMyEnrollments(): Promise<EnrollmentView[]> {
  const res = await apiFetch<unknown>('/api/enrollments/my');
  return unwrapData<EnrollmentView[]>(res);
}

export async function requestEnrollment(
  payload: RequestEnrollmentRequest
): Promise<EnrollmentView> {
  const res = await apiFetch<unknown>('/api/enrollments/request', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  invalidatePublishedExerciseCache();
  return unwrapData<EnrollmentView>(res);
}

export async function respondToEnrollment(
  id: string,
  payload: RespondEnrollmentRequest
): Promise<EnrollmentView> {
  const res = await apiFetch<unknown>(`/api/enrollments/${encodeURIComponent(id)}/respond`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  invalidatePublishedExerciseCache();
  return unwrapData<EnrollmentView>(res);
}

export async function deleteEnrollment(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/enrollments/${encodeURIComponent(id)}`, { method: 'DELETE' });
  invalidatePublishedExerciseCache();
}

export async function fetchNotifications(): Promise<NotificationsPayload> {
  const res = await apiFetch<unknown>('/api/notifications');
  const data = unwrapData<Partial<NotificationsPayload>>(res);
  return { items: data.items ?? [], unreadCount: data.unreadCount ?? 0 };
}

export async function markNotificationRead(id: string): Promise<NotificationView> {
  const res = await apiFetch<unknown>(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PATCH',
    body: JSON.stringify({})
  });
  return unwrapData<NotificationView>(res);
}

export async function markAllNotificationsRead(): Promise<number> {
  const res = await apiFetch<unknown>('/api/notifications/read-all', {
    method: 'POST',
    body: JSON.stringify({})
  });
  return unwrapData<{ updated?: number }>(res).updated ?? 0;
}

/** Admin endpoints: session cookie (credentials) AND/OR break-glass key header. */
function adminHeaders(): Record<string, string> {
  return getAdminAuthHeaders();
}

export async function fetchAdminUsers(query: AdminUsersQuery = {}): Promise<AdminUsersPayload> {
  const search = new URLSearchParams();
  if (query.role) search.set('role', query.role);
  if (query.accountStatus) search.set('accountStatus', query.accountStatus);
  if (query.search?.trim()) search.set('search', query.search.trim());
  if (query.limit !== undefined) search.set('limit', String(query.limit));
  if (query.offset !== undefined) search.set('offset', String(query.offset));
  const qs = search.toString();
  const res = await apiFetch<unknown>(qs ? `/api/admin/users?${qs}` : '/api/admin/users', {
    headers: adminHeaders()
  });
  const data = unwrapData<Partial<AdminUsersPayload>>(res);
  return { items: data.items ?? [], total: data.total ?? 0 };
}

export async function createAdminUser(payload: CreateUserAdminRequest): Promise<AdminUserView> {
  const res = await apiFetch<unknown>('/api/admin/users', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload)
  });
  return unwrapData<AdminUserView>(res);
}

export async function updateAdminUser(
  id: string,
  payload: UpdateUserAdminRequest
): Promise<AdminUserView> {
  const res = await apiFetch<unknown>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(payload)
  });
  invalidatePublishedExerciseCache();
  return unwrapData<AdminUserView>(res);
}

export async function generateAdminUserResetLink(
  id: string
): Promise<{ resetUrl: string; expiresAt: string }> {
  const res = await apiFetch<unknown>(`/api/admin/users/${encodeURIComponent(id)}/reset-link`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({})
  });
  return unwrapData<{ resetUrl: string; expiresAt: string }>(res);
}

export async function deleteAdminUser(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminHeaders()
  });
  invalidatePublishedExerciseCache();
}
