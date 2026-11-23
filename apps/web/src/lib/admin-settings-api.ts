import type {
  AiProviderConfigView,
  AiProviderId,
  AiTaskRouteView,
  AiTaskType,
  CreateTelegramTarget,
  TelegramConfigView,
  TelegramTargetView,
  UpdateTelegramTarget,
  UpsertAiProviderConfig,
  UpsertAiTaskRoute,
  UpsertTelegramConfig
} from '@edumenai/shared';
import { adminFetch } from './admin-auth';

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

export async function fetchAiSettings(): Promise<AiSettingsData> {
  const res = await adminFetch<{ success: true; data: AiSettingsData }>(
    '/api/admin/settings/ai'
  );
  return res.data;
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
  return res.data;
}

export async function fetchTelegramSettings(): Promise<TelegramSettingsData> {
  const res = await adminFetch<{ success: true; data: TelegramSettingsData }>(
    '/api/admin/settings/telegram'
  );
  return res.data;
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
