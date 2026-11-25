import type {
  CreateTelegramTarget,
  ListReportsResponse,
  PersistedReport,
  TelegramTargetView,
  UpdateTelegramTarget
} from '@edumenai/shared';
import type {
  AdminExerciseDetail,
  AdminExerciseSummary,
  AdminPromptVersionView,
  CreateExerciseAdminInput,
  SaveExerciseDraftAdminInput
} from './admin-exercises-api';
import type { TelegramTestMessageResult } from './admin-settings-api';
import { apiFetch, type PublishedExerciseSummary } from './api';
import { fetchWithCache, invalidateCache, setCached } from './client-cache';

export const INSTRUCTOR_CACHE_KEYS = {
  overview: 'inst:overview',
  exercises: 'inst:exercises',
  exercise: (code: string) => `inst:exercise:${code}`,
  telegram: 'inst:telegram'
} as const;

export interface InstructorOverviewStats {
  approvedStudentsCount: number;
  pendingRequestsCount: number;
  myExercisesCount: number;
  publishedExercisesCount: number;
  totalSubmissionsCount: number;
  recentSubmissions: PersistedReport[];
}

export interface InstructorExercisesPayload {
  myExercises: AdminExerciseSummary[];
  platformExercises: PublishedExerciseSummary[];
}

export interface InstructorTelegramStatus {
  isEnabled?: boolean;
  hasBotToken?: boolean;
  enabled?: boolean;
  configured?: boolean;
  botConfigured?: boolean;
  botUsername?: string | null;
}

export interface InstructorTelegramData {
  config: InstructorTelegramStatus;
  targets: TelegramTargetView[];
}

export interface InstructorSubmissionsQuery {
  exerciseCode?: string;
  studentId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

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

function invalidateInstructorExerciseCaches(): void {
  invalidateCache('inst:exercises');
  invalidateCache('inst:exercise:');
  invalidateCache('inst:overview');
  invalidateCache('pub:');
}

export async function fetchInstructorOverview(options?: {
  force?: boolean;
}): Promise<InstructorOverviewStats> {
  return fetchWithCache(
    INSTRUCTOR_CACHE_KEYS.overview,
    async () => {
      const res = await apiFetch<unknown>('/api/instructor/overview');
      return unwrapData<InstructorOverviewStats>(res);
    },
    { ttlMs: 30_000, force: options?.force }
  );
}

export async function fetchInstructorSubmissions(
  params: InstructorSubmissionsQuery = {}
): Promise<ListReportsResponse['data']> {
  const search = new URLSearchParams();
  if (params.exerciseCode) search.set('exerciseCode', params.exerciseCode);
  if (params.studentId) search.set('studentId', params.studentId);
  if (params.search?.trim()) search.set('search', params.search.trim());
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  const qs = search.toString();
  const res = await apiFetch<unknown>(
    qs ? `/api/instructor/submissions?${qs}` : '/api/instructor/submissions'
  );
  const data = unwrapData<Partial<ListReportsResponse['data']>>(res);
  return { items: data.items ?? [], total: data.total ?? 0 };
}

export async function fetchInstructorExercises(options?: {
  force?: boolean;
}): Promise<InstructorExercisesPayload> {
  return fetchWithCache(
    INSTRUCTOR_CACHE_KEYS.exercises,
    async () => {
      const res = await apiFetch<unknown>('/api/instructor/exercises');
      const data = unwrapData<Partial<InstructorExercisesPayload>>(res);
      return {
        myExercises: data.myExercises ?? [],
        platformExercises: data.platformExercises ?? []
      };
    },
    { ttlMs: 30_000, force: options?.force }
  );
}

export async function createInstructorExercise(
  input: CreateExerciseAdminInput
): Promise<AdminExerciseDetail> {
  const res = await apiFetch<unknown>('/api/instructor/exercises', {
    method: 'POST',
    body: JSON.stringify(input)
  });
  const detail = unwrapData<AdminExerciseDetail>(res);
  invalidateInstructorExerciseCaches();
  setCached(INSTRUCTOR_CACHE_KEYS.exercise(detail.code), detail);
  return detail;
}

export async function fetchInstructorExercise(
  code: string,
  options?: { force?: boolean }
): Promise<AdminExerciseDetail> {
  return fetchWithCache(
    INSTRUCTOR_CACHE_KEYS.exercise(code),
    async () => {
      const res = await apiFetch<unknown>(
        `/api/instructor/exercises/${encodeURIComponent(code)}`
      );
      return unwrapData<AdminExerciseDetail>(res);
    },
    { ttlMs: 30_000, force: options?.force }
  );
}

export async function saveInstructorExerciseDraft(
  code: string,
  input: SaveExerciseDraftAdminInput
): Promise<{ exercise: AdminExerciseDetail; draftVersion: AdminPromptVersionView }> {
  const res = await apiFetch<unknown>(
    `/api/instructor/exercises/${encodeURIComponent(code)}/draft`,
    {
      method: 'PUT',
      body: JSON.stringify(input)
    }
  );
  const data = unwrapData<{
    exercise: AdminExerciseDetail;
    draftVersion: AdminPromptVersionView;
  }>(res);
  invalidateInstructorExerciseCaches();
  setCached(INSTRUCTOR_CACHE_KEYS.exercise(data.exercise.code), data.exercise);
  return data;
}

export async function publishInstructorExercise(
  code: string,
  versionId?: string
): Promise<{ exercise: AdminExerciseDetail; publishedVersion: AdminPromptVersionView }> {
  const res = await apiFetch<unknown>(
    `/api/instructor/exercises/${encodeURIComponent(code)}/publish`,
    {
      method: 'POST',
      body: JSON.stringify(versionId ? { versionId } : {})
    }
  );
  const data = unwrapData<{
    exercise: AdminExerciseDetail;
    publishedVersion: AdminPromptVersionView;
  }>(res);
  invalidateInstructorExerciseCaches();
  setCached(INSTRUCTOR_CACHE_KEYS.exercise(data.exercise.code), data.exercise);
  return data;
}

export async function duplicateInstructorExercise(
  code: string,
  input: { code: string; title: string }
): Promise<AdminExerciseDetail> {
  const res = await apiFetch<unknown>(
    `/api/instructor/exercises/${encodeURIComponent(code)}/duplicate`,
    {
      method: 'POST',
      body: JSON.stringify(input)
    }
  );
  const detail = unwrapData<AdminExerciseDetail>(res);
  invalidateInstructorExerciseCaches();
  setCached(INSTRUCTOR_CACHE_KEYS.exercise(detail.code), detail);
  return detail;
}

export async function deleteInstructorExercise(
  code: string
): Promise<{ deleted: boolean; code: string }> {
  const res = await apiFetch<unknown>(
    `/api/instructor/exercises/${encodeURIComponent(code)}`,
    {
      method: 'DELETE'
    }
  );
  invalidateInstructorExerciseCaches();
  return unwrapData<{ deleted: boolean; code: string }>(res);
}

export async function fetchInstructorTelegram(options?: {
  force?: boolean;
}): Promise<InstructorTelegramData> {
  return fetchWithCache(
    INSTRUCTOR_CACHE_KEYS.telegram,
    async () => {
      const res = await apiFetch<unknown>('/api/instructor/telegram');
      const data = unwrapData<Partial<InstructorTelegramData>>(res);
      return {
        config: data.config ?? { isEnabled: false, hasBotToken: false },
        targets: data.targets ?? []
      };
    },
    { ttlMs: 30_000, force: options?.force }
  );
}

export async function createInstructorTelegramTarget(
  input: CreateTelegramTarget
): Promise<TelegramTargetView> {
  const res = await apiFetch<unknown>('/api/instructor/telegram/targets', {
    method: 'POST',
    body: JSON.stringify(input)
  });
  invalidateCache('inst:telegram');
  return unwrapData<TelegramTargetView>(res);
}

export async function updateInstructorTelegramTarget(
  id: string,
  input: UpdateTelegramTarget
): Promise<TelegramTargetView> {
  const res = await apiFetch<unknown>(
    `/api/instructor/telegram/targets/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(input)
    }
  );
  invalidateCache('inst:telegram');
  return unwrapData<TelegramTargetView>(res);
}

export async function deleteInstructorTelegramTarget(
  id: string
): Promise<{ deleted: boolean; id: string }> {
  const res = await apiFetch<unknown>(
    `/api/instructor/telegram/targets/${encodeURIComponent(id)}`,
    {
      method: 'DELETE'
    }
  );
  invalidateCache('inst:telegram');
  return unwrapData<{ deleted: boolean; id: string }>(res);
}

export async function sendInstructorTelegramTest(
  chatId: string,
  message?: string
): Promise<TelegramTestMessageResult> {
  const res = await apiFetch<unknown>('/api/instructor/telegram/test', {
    method: 'POST',
    body: JSON.stringify({
      chatId,
      ...(message?.trim() ? { message: message.trim() } : {})
    })
  });
  return unwrapData<TelegramTestMessageResult>(res);
}
