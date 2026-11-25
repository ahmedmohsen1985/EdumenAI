import type {
  AiProviderConfigView,
  AiProviderId,
  AiTaskRouteView,
  AiTaskType,
  CreateTelegramTarget,
  PlatformBillingConfigView,
  TelegramConfigView,
  TelegramTargetView,
  TokenMetricsResponse,
  UpdateBillingConfig,
  UpdateTelegramTarget,
  UpsertAiProviderConfig,
  UpsertAiTaskRoute,
  UpsertTelegramConfig
} from '@edumenai/shared';
import { adminFetch } from './admin-auth';
import { fetchWithCache, invalidateCache } from './client-cache';

export const ADMIN_SETTINGS_CACHE_KEYS = {
  ai: 'admin:ai',
  telegram: 'admin:telegram',
  billing: 'admin:billing',
  tokenMetrics: (days: number) => `admin:metrics:tokens:${days}`
} as const;

export interface AiSettingsData {
  providers: AiProviderConfigView[];
  routes: AiTaskRouteView[];
}

export interface AiProviderTestResult {
  ok: boolean;
  provider: AiProviderId;
  model: string;
  latencyMs: number;
  message: string;
}

export interface TelegramSettingsData {
  config: TelegramConfigView;
  targets: TelegramTargetView[];
}

export interface TelegramTestMessageResult {
  ok: boolean;
  chatId: string;
  messageId?: number;
  error?: string;
}

export async function fetchAiSettings(options?: { force?: boolean }): Promise<AiSettingsData> {
  return fetchWithCache(
    ADMIN_SETTINGS_CACHE_KEYS.ai,
    async () => {
      const res = await adminFetch<{ success: true; data: AiSettingsData }>(
        '/api/admin/settings/ai'
      );
      return res.data;
    },
    { ttlMs: 30_000, force: options?.force }
  );
}

export async function saveAiProviderConfig(
  provider: AiProviderId,
  input: Omit<UpsertAiProviderConfig, 'provider'>
): Promise<AiProviderConfigView> {
  const res = await adminFetch<{ success: true; data: AiProviderConfigView }>(
    `/api/admin/settings/ai/providers/${encodeURIComponent(provider)}`,
    {
      method: 'PUT',
      body: JSON.stringify(input)
    }
  );
  invalidateCache('admin:ai');
  invalidateCache('admin:stats');
  return res.data;
}

export async function testAiProvider(
  provider: AiProviderId
): Promise<AiProviderTestResult> {
  const res = await adminFetch<{ success: true; data: AiProviderTestResult }>(
    `/api/admin/settings/ai/providers/${encodeURIComponent(provider)}/test`,
    {
      method: 'POST',
      body: JSON.stringify({})
    }
  );
  return res.data;
}

export async function saveAiTaskRoute(
  taskType: AiTaskType,
  input: Omit<UpsertAiTaskRoute, 'taskType'>
): Promise<AiTaskRouteView> {
  const res = await adminFetch<{ success: true; data: AiTaskRouteView }>(
    `/api/admin/settings/ai/routes/${encodeURIComponent(taskType)}`,
    {
      method: 'PUT',
      body: JSON.stringify(input)
    }
  );
  invalidateCache('admin:ai');
  invalidateCache('admin:stats');
  return res.data;
}

export async function resetAiTaskRoute(
  taskType: AiTaskType
): Promise<{ deleted: boolean; taskType: AiTaskType }> {
  const res = await adminFetch<{
    success: true;
    data: { deleted: boolean; taskType: AiTaskType };
  }>(`/api/admin/settings/ai/routes/${encodeURIComponent(taskType)}`, {
    method: 'DELETE'
  });
  invalidateCache('admin:ai');
  invalidateCache('admin:stats');
  return res.data;
}

export async function fetchTelegramSettings(options?: {
  force?: boolean;
}): Promise<TelegramSettingsData> {
  return fetchWithCache(
    ADMIN_SETTINGS_CACHE_KEYS.telegram,
    async () => {
      const res = await adminFetch<{ success: true; data: TelegramSettingsData }>(
        '/api/admin/settings/telegram'
      );
      return res.data;
    },
    { ttlMs: 30_000, force: options?.force }
  );
}

export async function saveTelegramConfig(
  input: UpsertTelegramConfig
): Promise<TelegramConfigView> {
  const res = await adminFetch<{ success: true; data: TelegramConfigView }>(
    '/api/admin/settings/telegram',
    {
      method: 'PUT',
      body: JSON.stringify(input)
    }
  );
  invalidateCache('admin:telegram');
  invalidateCache('admin:stats');
  return res.data;
}

export async function createTelegramTarget(
  input: CreateTelegramTarget
): Promise<TelegramTargetView> {
  const res = await adminFetch<{ success: true; data: TelegramTargetView }>(
    '/api/admin/settings/telegram/targets',
    {
      method: 'POST',
      body: JSON.stringify(input)
    }
  );
  invalidateCache('admin:telegram');
  invalidateCache('admin:stats');
  return res.data;
}

export async function updateTelegramTarget(
  id: string,
  input: UpdateTelegramTarget
): Promise<TelegramTargetView> {
  const res = await adminFetch<{ success: true; data: TelegramTargetView }>(
    `/api/admin/settings/telegram/targets/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(input)
    }
  );
  invalidateCache('admin:telegram');
  invalidateCache('admin:stats');
  return res.data;
}

export async function deleteTelegramTarget(
  id: string
): Promise<{ deleted: boolean; id: string }> {
  const res = await adminFetch<{
    success: true;
    data: { deleted: boolean; id: string };
  }>(`/api/admin/settings/telegram/targets/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  invalidateCache('admin:telegram');
  invalidateCache('admin:stats');
  return res.data;
}

export async function sendTelegramTest(input: {
  chatId: string;
  message?: string;
}): Promise<TelegramTestMessageResult> {
  const res = await adminFetch<{ success: true; data: TelegramTestMessageResult }>(
    '/api/admin/settings/telegram/test',
    {
      method: 'POST',
      body: JSON.stringify(input)
    }
  );
  return res.data;
}


export async function fetchBillingConfig(options?: {
  force?: boolean;
}): Promise<PlatformBillingConfigView> {
  return fetchWithCache(
    ADMIN_SETTINGS_CACHE_KEYS.billing,
    async () => {
      const res = await adminFetch<{ success: true; data: PlatformBillingConfigView }>(
        '/api/admin/settings/billing'
      );
      return res.data;
    },
    { ttlMs: 30_000, force: options?.force }
  );
}

export async function updateBillingConfig(
  input: UpdateBillingConfig
): Promise<PlatformBillingConfigView> {
  const res = await adminFetch<{ success: true; data: PlatformBillingConfigView }>(
    '/api/admin/settings/billing',
    {
      method: 'PUT',
      body: JSON.stringify(input)
    }
  );
  invalidateCache('admin:billing');
  return res.data;
}

export async function fetchTokenMetrics(
  days = 30,
  options?: { force?: boolean }
): Promise<TokenMetricsResponse> {
  return fetchWithCache(
    ADMIN_SETTINGS_CACHE_KEYS.tokenMetrics(days),
    async () => {
      const res = await adminFetch<{ success: true; data: TokenMetricsResponse }>(
        `/api/admin/metrics/tokens?days=${encodeURIComponent(String(days))}`
      );
      return res.data;
    },
    { ttlMs: 30_000, force: options?.force }
  );
}
