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

export interface AdminExerciseSummary {
  id: string;
  code: string;
  skill: ExerciseSkill;
  title: string;
  description: string | null;
  totalMarks: number;
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

export async function fetchAdminExercises(): Promise<AdminExerciseSummary[]> {
  const res = await adminFetch<{ success: true; data: AdminExerciseSummary[] }>(
    '/api/admin/exercises'
  );
  return res.data;
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
  return res.data;
}

export async function fetchAdminExercise(code: string): Promise<AdminExerciseDetail> {
  const res = await adminFetch<{ success: true; data: AdminExerciseDetail }>(
    `/api/admin/exercises/${encodeURIComponent(code)}`
  );
  return res.data;
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
  return res.data;
}

export async function fetchTelegramTargetsSummary(): Promise<TelegramTargetView[]> {
  const res = await adminFetch<{
    success: true;
    data: { config: TelegramConfigView; targets: TelegramTargetView[] };
  }>('/api/admin/settings/telegram');
  return res.data.targets;
}

export async function fetchAdminPlatformStats(): Promise<AdminPlatformStats> {
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
}
