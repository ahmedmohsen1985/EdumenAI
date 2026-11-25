import type {
  AiProviderConfigView,
  AiTaskRouteView,
  ExerciseSkill,
  PromptEntry,
  TelegramConfigView,
  TelegramTargetView,
  TemplateConfig,
  VersionStatus
} from '@edumenai/shared';
import { adminFetch } from './admin-auth';
import { fetchWithCache, invalidateCache, setCached } from './client-cache';

export const ADMIN_EXERCISES_CACHE_KEYS = {
  exercises: 'admin:exercises',
  exercise: (code: string) => `admin:exercise:${code}`,
  telegramTargets: 'admin:telegram:targets',
  stats: 'admin:stats'
} as const;

export interface AdminExerciseSummary {
  id: string;
  code: string;
  skill: ExerciseSkill;
  title: string;
  description: string | null;
  totalMarks: number;
  integrityEnabled?: boolean;
  versionCount: number;
  activeVersion: {
    id: string;
    version: number;
    publishedAt: string | null;
  } | null;
  latestDraft: {
    id: string;
    version: number;
    updatedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPromptVersionView {
  id: string;
  version: number;
  status: VersionStatus;
  isActive: boolean;
  templateSchema: TemplateConfig;
  promptEntries: PromptEntry[];
  markingSchema: Record<string, unknown>;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminExerciseDetail {
  id: string;
  code: string;
  skill: ExerciseSkill;
  title: string;
  description: string | null;
  totalMarks: number;
  integrityEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
  versions: AdminPromptVersionView[];
}

export interface CreateExerciseAdminInput {
  code: string;
  skill: ExerciseSkill;
  title: string;
  description?: string | null;
  totalMarks?: number;
}

export interface SaveExerciseDraftAdminInput {
  title?: string;
  description?: string | null;
  skill?: ExerciseSkill;
  totalMarks?: number;
  integrityEnabled?: boolean;
  templateSchema?: TemplateConfig;
  promptEntries?: PromptEntry[];
  markingSchema?: Record<string, unknown>;
}

export interface AdminPlatformStats {
  aiProviders: AiProviderConfigView[];
  aiRoutes: AiTaskRouteView[];
  telegramConfig: TelegramConfigView;
  telegramTargets: TelegramTargetView[];
}

export async function fetchAdminExercises(options?: {
  force?: boolean;
}): Promise<AdminExerciseSummary[]> {
  return fetchWithCache(
    ADMIN_EXERCISES_CACHE_KEYS.exercises,
    async () => {
      const res = await adminFetch<{ success: true; data: AdminExerciseSummary[] }>(
        '/api/admin/exercises'
      );
      return res.data;
    },
    { ttlMs: 30_000, force: options?.force }
  );
}

export async function createAdminExercise(
  input: CreateExerciseAdminInput
): Promise<AdminExerciseDetail> {
  const res = await adminFetch<{ success: true; data: AdminExerciseDetail }>(
    '/api/admin/exercises',
    {
      method: 'POST',
      body: JSON.stringify(input)
    }
  );
  invalidateCache('admin:exercises');
  invalidateCache('admin:exercise:');
  invalidateCache('admin:stats');
  invalidateCache('pub:');
  setCached(ADMIN_EXERCISES_CACHE_KEYS.exercise(res.data.code), res.data);
  return res.data;
}

export async function fetchAdminExercise(
  code: string,
  options?: { force?: boolean }
): Promise<AdminExerciseDetail> {
  return fetchWithCache(
    ADMIN_EXERCISES_CACHE_KEYS.exercise(code),
    async () => {
      const res = await adminFetch<{ success: true; data: AdminExerciseDetail }>(
        `/api/admin/exercises/${encodeURIComponent(code)}`
      );
      return res.data;
    },
    { ttlMs: 30_000, force: options?.force }
  );
}

export async function saveAdminExerciseDraft(
  code: string,
  input: SaveExerciseDraftAdminInput
): Promise<{ exercise: AdminExerciseDetail; draftVersion: AdminPromptVersionView }> {
  const res = await adminFetch<{
    success: true;
    data: { exercise: AdminExerciseDetail; draftVersion: AdminPromptVersionView };
  }>(`/api/admin/exercises/${encodeURIComponent(code)}/draft`, {
    method: 'PUT',
    body: JSON.stringify(input)
  });
  invalidateCache('admin:exercises');
  invalidateCache('admin:exercise:');
  invalidateCache('admin:stats');
  invalidateCache('pub:');
  setCached(ADMIN_EXERCISES_CACHE_KEYS.exercise(res.data.exercise.code), res.data.exercise);
  return res.data;
}

export async function publishAdminExercise(
  code: string,
  versionId?: string
): Promise<{ exercise: AdminExerciseDetail; publishedVersion: AdminPromptVersionView }> {
  const res = await adminFetch<{
    success: true;
    data: { exercise: AdminExerciseDetail; publishedVersion: AdminPromptVersionView };
  }>(`/api/admin/exercises/${encodeURIComponent(code)}/publish`, {
    method: 'POST',
    body: JSON.stringify(versionId ? { versionId } : {})
  });
  invalidateCache('admin:exercises');
  invalidateCache('admin:exercise:');
  invalidateCache('admin:stats');
  invalidateCache('pub:');
  setCached(ADMIN_EXERCISES_CACHE_KEYS.exercise(res.data.exercise.code), res.data.exercise);
  return res.data;
}

export async function deleteAdminExercise(
  code: string
): Promise<{ deleted: boolean; code: string }> {
  const res = await adminFetch<{
    success: true;
    data: { deleted: boolean; code: string };
  }>(`/api/admin/exercises/${encodeURIComponent(code)}`, {
    method: 'DELETE'
  });
  invalidateCache('admin:exercises');
  invalidateCache('admin:exercise:');
  invalidateCache('admin:stats');
  invalidateCache('pub:');
  return res.data;
}

export async function duplicateAdminExercise(
  code: string,
  input: { code: string; title: string }
): Promise<AdminExerciseDetail> {
  const res = await adminFetch<{ success: true; data: AdminExerciseDetail }>(
    `/api/admin/exercises/${encodeURIComponent(code)}/duplicate`,
    {
      method: 'POST',
      body: JSON.stringify(input)
    }
  );
  invalidateCache('admin:exercises');
  invalidateCache('admin:exercise:');
  invalidateCache('admin:stats');
  invalidateCache('pub:');
  setCached(ADMIN_EXERCISES_CACHE_KEYS.exercise(res.data.code), res.data);
  return res.data;
}

export async function fetchTelegramTargetsSummary(options?: {
  force?: boolean;
}): Promise<TelegramTargetView[]> {
  return fetchWithCache(
    ADMIN_EXERCISES_CACHE_KEYS.telegramTargets,
    async () => {
      const res = await adminFetch<{
        success: true;
        data: { config: TelegramConfigView; targets: TelegramTargetView[] };
      }>('/api/admin/settings/telegram');
      return res.data.targets;
    },
    { ttlMs: 30_000, force: options?.force }
  );
}

export async function fetchAdminPlatformStats(options?: {
  force?: boolean;
}): Promise<AdminPlatformStats> {
  return fetchWithCache(
    ADMIN_EXERCISES_CACHE_KEYS.stats,
    async () => {
      const [aiRes, tgRes] = await Promise.all([
        adminFetch<{
          success: true;
          data: { providers: AiProviderConfigView[]; routes: AiTaskRouteView[] };
        }>('/api/admin/settings/ai'),
        adminFetch<{
          success: true;
          data: { config: TelegramConfigView; targets: TelegramTargetView[] };
        }>('/api/admin/settings/telegram')
      ]);

      return {
        aiProviders: aiRes.data.providers,
        aiRoutes: aiRes.data.routes,
        telegramConfig: tgRes.data.config,
        telegramTargets: tgRes.data.targets
      };
    },
    { ttlMs: 30_000, force: options?.force }
  );
}
