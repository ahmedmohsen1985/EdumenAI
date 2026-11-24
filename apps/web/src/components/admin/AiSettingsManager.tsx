'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type {
  AiProviderConfigView,
  AiProviderId,
  AiTaskRouteView,
  AiTaskType
} from '@edumenai/shared';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  Headphones,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  ScanText,
  Sparkles,
  Zap
} from 'lucide-react';
import {
  ADMIN_SETTINGS_CACHE_KEYS,
  fetchAiSettings,
  resetAiTaskRoute,
  saveAiProviderConfig,
  saveAiTaskRoute,
  testAiProvider,
  type AiProviderTestResult,
  type AiSettingsData
} from '../../lib/admin-settings-api';
import { getCached, isCacheFresh } from '../../lib/client-cache';
import { PageEntrance } from '../ui/MotionPrimitives';

interface ProviderMeta {
  id: AiProviderId;
  title: string;
  subtitle: string;
  defaultBaseUrl: string;
  defaultModelPlaceholder: string;
}

const PROVIDER_META: Record<AiProviderId, ProviderMeta> = {
  google: {
    id: 'google',
    title: 'Google Gemini',
    subtitle: 'Gemini 2.5 / 3.5 multimodal vision, audio & reasoning',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModelPlaceholder: 'gemini-3.5-flash'
  },
  openai: {
    id: 'openai',
    title: 'OpenAI',
    subtitle: 'GPT-4o / o-series reasoning & Whisper audio transcription',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModelPlaceholder: 'gpt-4o'
  },
  anthropic: {
    id: 'anthropic',
    title: 'Anthropic Claude',
    subtitle: 'Claude Sonnet / Opus structured tool-use marking',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModelPlaceholder: 'claude-sonnet-4-20250514'
  },
  openrouter: {
    id: 'openrouter',
    title: 'OpenRouter',
    subtitle: 'Unified multi-model gateway across Google, OpenAI & Anthropic',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModelPlaceholder: 'google/gemini-2.5-flash'
  }
};

const MODEL_PRESETS_BY_PROVIDER: Record<AiProviderId, string[]> = {
  google: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'whisper-1'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219'],
  openrouter: [
    'google/gemini-2.5-flash',
    'google/gemini-2.5-pro',
    'anthropic/claude-sonnet-4',
    'openai/gpt-4o'
  ]
};

interface TaskMeta {
  taskType: AiTaskType;
  title: string;
  subtitle: string;
  highlightNote?: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TASK_META: Record<AiTaskType, TaskMeta> = {
  vision: {
    taskType: 'vision',
    title: 'Vision & OCR',
    subtitle: 'OCR & Handwriting Transcription',
    icon: ScanText
  },
  evaluation: {
    taskType: 'evaluation',
    title: 'Examiner Evaluation',
    subtitle: 'Examiner Marking & Feedback',
    icon: Sparkles
  },
  audio: {
    taskType: 'audio',
    title: 'Audio & Speech',
    subtitle: 'Audio Transcription / Speech-to-Text (Whisper / Listening & Speaking Ready)',
    highlightNote:
      'Powers future Listening & Speaking exercises via Whisper or multimodal audio models.',
    icon: Headphones
  }
};

interface ProviderFormState {
  apiKey: string;
  showKey: boolean;
  baseUrl: string;
  model: string;
  isEnabled: boolean;
  isDefault: boolean;
}

interface RouteFormState {
  provider: AiProviderId;
  model: string;
  thinkingEffort: string;
  maxTokens: string;
  isActive: boolean;
}

const THINKING_EFFORT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'Default (Auto / .env)' },
  { value: 'none', label: 'None (Off)' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' }
];

function extractThinkingEffort(
  reasoningConfig: Record<string, unknown> | null | undefined
): string {
  if (!reasoningConfig) return '';
  const raw =
    typeof reasoningConfig.effort === 'string'
      ? reasoningConfig.effort
      : typeof reasoningConfig.thinkingLevel === 'string'
        ? reasoningConfig.thinkingLevel
        : '';
  const normalized = raw.trim().toLowerCase();
  return ['none', 'minimal', 'low', 'medium', 'high'].includes(normalized) ? normalized : '';
}

function sourceBadgeClasses(source: 'database' | 'env' | 'default' | 'none'): string {
  if (source === 'database') {
    return 'bg-emerald-50/90 text-emerald-700 border-emerald-200';
  }
  if (source === 'env') {
    return 'bg-white/80 text-zinc-700 border-zinc-200/80';
  }
  if (source === 'default') {
    return 'bg-amber-50/90 text-amber-800 border-amber-200';
  }
  return 'bg-zinc-100/80 text-zinc-600 border-zinc-200';
}

function providerSourceLabel(source: AiProviderConfigView['source']): string {
  if (source === 'database') return 'Database (Encrypted)';
  if (source === 'env') return '.env Fallback';
  return 'Not Configured';
}

function routeSourceLabel(source: AiTaskRouteView['source']): string {
  if (source === 'database') return 'Database Override';
  if (source === 'env') return '.env Fallback';
  return 'Default';
}

export function AiSettingsManager(): React.ReactElement {
  const cachedAi = getCached<AiSettingsData>(ADMIN_SETTINGS_CACHE_KEYS.ai);

  const [providers, setProviders] = useState<AiProviderConfigView[]>(cachedAi?.providers ?? []);
  const [routes, setRoutes] = useState<AiTaskRouteView[]>(cachedAi?.routes ?? []);
  const [providerForms, setProviderForms] = useState<Record<AiProviderId, ProviderFormState>>(() => {
    const base: Record<AiProviderId, ProviderFormState> = {
      google: { apiKey: '', showKey: false, baseUrl: '', model: '', isEnabled: true, isDefault: false },
      openai: { apiKey: '', showKey: false, baseUrl: '', model: '', isEnabled: true, isDefault: false },
      anthropic: { apiKey: '', showKey: false, baseUrl: '', model: '', isEnabled: true, isDefault: false },
      openrouter: { apiKey: '', showKey: false, baseUrl: '', model: '', isEnabled: true, isDefault: false }
    };
    if (cachedAi) {
      for (const p of cachedAi.providers) {
        base[p.provider] = {
          apiKey: '',
          showKey: false,
          baseUrl: p.baseUrl ?? '',
          model: p.model ?? '',
          isEnabled: p.isEnabled,
          isDefault: p.isDefault
        };
      }
    }
    return base;
  });
  const [routeForms, setRouteForms] = useState<Record<AiTaskType, RouteFormState>>(() => {
    const base: Record<AiTaskType, RouteFormState> = {
      vision: { provider: 'google', model: '', thinkingEffort: '', maxTokens: '', isActive: true },
      evaluation: { provider: 'google', model: '', thinkingEffort: '', maxTokens: '', isActive: true },
      audio: { provider: 'openai', model: 'whisper-1', thinkingEffort: '', maxTokens: '', isActive: true }
    };
    if (cachedAi) {
      for (const r of cachedAi.routes) {
        base[r.taskType] = {
          provider: r.provider,
          model: r.model,
          thinkingEffort: extractThinkingEffort(r.reasoningConfig),
          maxTokens: r.maxTokens !== null && r.maxTokens !== undefined ? String(r.maxTokens) : '',
          isActive: r.isActive
        };
      }
    }
    return base;
  });

  const [isLoading, setIsLoading] = useState<boolean>(cachedAi === null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [savingProvider, setSavingProvider] = useState<AiProviderId | null>(null);
  const [testingProvider, setTestingProvider] = useState<AiProviderId | null>(null);
  const [providerStatus, setProviderStatus] = useState<
    Partial<Record<AiProviderId, { ok: boolean; message: string }>>
  >({});
  const [providerTests, setProviderTests] = useState<
    Partial<Record<AiProviderId, AiProviderTestResult>>
  >({});

  const [savingRoute, setSavingRoute] = useState<AiTaskType | null>(null);
  const [resettingRoute, setResettingRoute] = useState<AiTaskType | null>(null);
  const [routeStatus, setRouteStatus] = useState<
    Partial<Record<AiTaskType, { ok: boolean; message: string }>>
  >({});

  const hydrateFromData = useCallback(
    (data: { providers: AiProviderConfigView[]; routes: AiTaskRouteView[] }) => {
      setProviders(data.providers);
      setRoutes(data.routes);

      setProviderForms((prev) => {
        const next = { ...prev };
        for (const p of data.providers) {
          next[p.provider] = {
            apiKey: '',
            showKey: prev[p.provider]?.showKey ?? false,
            baseUrl: p.baseUrl ?? '',
            model: p.model ?? '',
            isEnabled: p.isEnabled,
            isDefault: p.isDefault
          };
        }
        return next;
      });

      setRouteForms((prev) => {
        const next = { ...prev };
        for (const r of data.routes) {
          next[r.taskType] = {
            provider: r.provider,
            model: r.model,
            thinkingEffort: extractThinkingEffort(r.reasoningConfig),
            maxTokens: r.maxTokens !== null && r.maxTokens !== undefined ? String(r.maxTokens) : '',
            isActive: r.isActive
          };
        }
        return next;
      });
    },
    []
  );

  const loadSettings = useCallback(
    async (options?: { silent?: boolean; force?: boolean }) => {
      if (!options?.silent) {
        setIsLoading(true);
      }
      setLoadError(null);
      try {
        const data = await fetchAiSettings({ force: options?.force });
        hydrateFromData(data);
      } catch (err: unknown) {
        if (!options?.silent) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load AI settings.');
        }
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [hydrateFromData]
  );

  useEffect(() => {
    const cached = getCached<AiSettingsData>(ADMIN_SETTINGS_CACHE_KEYS.ai);
    if (cached && isCacheFresh(ADMIN_SETTINGS_CACHE_KEYS.ai, 30_000)) {
      setIsLoading(false);
      return;
    }
    void loadSettings({ silent: cached !== null });
  }, [loadSettings]);

  const handleSaveProvider = async (providerId: AiProviderId): Promise<void> => {
    const form = providerForms[providerId];
    setSavingProvider(providerId);
    setProviderStatus((prev) => ({ ...prev, [providerId]: undefined }));

    try {
      const trimmedKey = form.apiKey.trim();
      const updated = await saveAiProviderConfig(providerId, {
        ...(trimmedKey ? { apiKey: trimmedKey } : {}),
        baseUrl: form.baseUrl.trim() ? form.baseUrl.trim() : null,
        model: form.model.trim() ? form.model.trim() : null,
        isEnabled: form.isEnabled,
        isDefault: form.isDefault
      });

      setProviders((prev) => prev.map((p) => (p.provider === providerId ? updated : p)));
      setProviderForms((prev) => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          apiKey: '',
          baseUrl: updated.baseUrl ?? '',
          model: updated.model ?? '',
          isEnabled: updated.isEnabled,
          isDefault: updated.isDefault
        }
      }));
      setProviderStatus((prev) => ({
        ...prev,
        [providerId]: { ok: true, message: 'Provider settings saved.' }
      }));
    } catch (err: unknown) {
      setProviderStatus((prev) => ({
        ...prev,
        [providerId]: {
          ok: false,
          message: err instanceof Error ? err.message : 'Failed to save provider settings.'
        }
      }));
    } finally {
      setSavingProvider(null);
    }
  };

  const handleTestProvider = async (providerId: AiProviderId): Promise<void> => {
    setTestingProvider(providerId);
    setProviderTests((prev) => ({ ...prev, [providerId]: undefined }));
    try {
      const result = await testAiProvider(providerId);
      setProviderTests((prev) => ({ ...prev, [providerId]: result }));
    } catch (err: unknown) {
      setProviderTests((prev) => ({
        ...prev,
        [providerId]: {
          ok: false,
          provider: providerId,
          model: providerForms[providerId].model || '',
          latencyMs: 0,
          message: err instanceof Error ? err.message : 'Connection test failed.'
        }
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveRoute = async (taskType: AiTaskType): Promise<void> => {
    const form = routeForms[taskType];
    if (!form.model.trim()) {
      setRouteStatus((prev) => ({
        ...prev,
        [taskType]: { ok: false, message: 'Model name is required.' }
      }));
      return;
    }

    let maxTokens: number | null = null;
    if (form.maxTokens.trim() !== '') {
      const parsedTokens = Number.parseInt(form.maxTokens, 10);
      if (!Number.isFinite(parsedTokens) || parsedTokens <= 0) {
        setRouteStatus((prev) => ({
          ...prev,
          [taskType]: { ok: false, message: 'Max tokens must be a positive integer.' }
        }));
        return;
      }
      maxTokens = parsedTokens;
    }

    setSavingRoute(taskType);
    setRouteStatus((prev) => ({ ...prev, [taskType]: undefined }));

    try {
      await saveAiTaskRoute(taskType, {
        provider: form.provider,
        model: form.model.trim(),
        temperature: null,
        reasoningConfig: form.thinkingEffort
          ? {
              effort: form.thinkingEffort,
              thinkingLevel: form.thinkingEffort.toUpperCase()
            }
          : null,
        maxTokens,
        isActive: form.isActive
      });
      const refreshed = await fetchAiSettings();
      hydrateFromData(refreshed);
      setRouteStatus((prev) => ({
        ...prev,
        [taskType]: { ok: true, message: 'Task route override saved.' }
      }));
    } catch (err: unknown) {
      setRouteStatus((prev) => ({
        ...prev,
        [taskType]: {
          ok: false,
          message: err instanceof Error ? err.message : 'Failed to save task route.'
        }
      }));
    } finally {
      setSavingRoute(null);
    }
  };

  const handleResetRoute = async (taskType: AiTaskType): Promise<void> => {
    setResettingRoute(taskType);
    setRouteStatus((prev) => ({ ...prev, [taskType]: undefined }));
    try {
      await resetAiTaskRoute(taskType);
      const refreshed = await fetchAiSettings();
      hydrateFromData(refreshed);
      setRouteStatus((prev) => ({
        ...prev,
        [taskType]: { ok: true, message: 'Reverted to .env / default route.' }
      }));
    } catch (err: unknown) {
      setRouteStatus((prev) => ({
        ...prev,
        [taskType]: {
          ok: false,
          message: err instanceof Error ? err.message : 'Failed to reset task route.'
        }
      }));
    } finally {
      setResettingRoute(null);
    }
  };

  const applyWhisperPreset = (): void => {
    setRouteForms((prev) => ({
      ...prev,
      audio: {
        ...prev.audio,
        provider: 'openai',
        model: 'whisper-1',
        isActive: true
      }
    }));
  };

  return (
    <PageEntrance className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            AI Providers &amp; Task Routing
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage encrypted provider credentials and route Vision, Evaluation, and Audio tasks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSettings({ force: true })}
          disabled={isLoading}
          className="glass-btn-secondary !py-2"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="glass-panel-strong flex items-center gap-2.5 border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm text-rose-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{loadError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="glass-panel flex items-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">Loading AI configuration...</span>
        </div>
      ) : (
        <>
          {/* Section A: AI Provider Credentials */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-200/70 pb-2.5">
              <KeyRound className="h-5 w-5 text-zinc-700" />
              <h2 className="text-lg font-bold text-zinc-900">
                Section A — AI Provider Credentials
              </h2>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {providers.map((provider) => {
                const meta = PROVIDER_META[provider.provider];
                const form = providerForms[provider.provider];
                const status = providerStatus[provider.provider];
                const testResult = providerTests[provider.provider];
                const isSaving = savingProvider === provider.provider;
                const isTesting = testingProvider === provider.provider;

                return (
                  <div
                    key={provider.provider}
                    className="glass-panel flex flex-col justify-between p-5"
                  >
                    <div className="space-y-4">
                      {/* Card Header */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm">
                            <Bot className="h-5 w-5" />
                          </span>
                          <div>
                            <h3 className="text-base font-bold text-zinc-900">{meta.title}</h3>
                            <p className="text-xs text-zinc-500">{meta.subtitle}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${sourceBadgeClasses(
                              provider.source
                            )}`}
                          >
                            {providerSourceLabel(provider.source)}
                          </span>
                          {provider.isDefault && (
                            <span className="glass-pill !bg-zinc-900 !text-white !border-zinc-900">
                              Default
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Masked Key Pill */}
                      <div className="flex items-center justify-between rounded-xl border border-zinc-200/70 bg-white/60 px-3 py-2 text-xs">
                        <span className="font-medium text-zinc-600">Stored Key:</span>
                        <span className="font-mono font-semibold text-zinc-900">
                          {provider.hasApiKey && provider.apiKeyMasked
                            ? provider.apiKeyMasked
                            : 'Not set'}
                        </span>
                      </div>

                      {/* API Key Input */}
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700">
                          API Key
                        </label>
                        <div className="relative mt-1">
                          <input
                            type={form.showKey ? 'text' : 'password'}
                            value={form.apiKey}
                            autoComplete="new-password"
                            onChange={(e) =>
                              setProviderForms((prev) => ({
                                ...prev,
                                [provider.provider]: {
                                  ...prev[provider.provider],
                                  apiKey: e.target.value
                                }
                              }))
                            }
                            placeholder="Enter new API key to save/rotate (leave blank to keep current)"
                            className="glass-input !py-2 !pr-10"
                          />
                          <button
                            type="button"
                            aria-label={form.showKey ? 'Hide API key' : 'Show API key'}
                            onClick={() =>
                              setProviderForms((prev) => ({
                                ...prev,
                                [provider.provider]: {
                                  ...prev[provider.provider],
                                  showKey: !prev[provider.provider].showKey
                                }
                              }))
                            }
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                          >
                            {form.showKey ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Base URL & Default Model */}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700">
                            Base URL (optional)
                          </label>
                          <input
                            type="text"
                            value={form.baseUrl}
                            onChange={(e) =>
                              setProviderForms((prev) => ({
                                ...prev,
                                [provider.provider]: {
                                  ...prev[provider.provider],
                                  baseUrl: e.target.value
                                }
                              }))
                            }
                            placeholder={meta.defaultBaseUrl}
                            className="glass-input mt-1 !py-2"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700">
                            Default Model (optional)
                          </label>
                          <input
                            type="text"
                            value={form.model}
                            onChange={(e) =>
                              setProviderForms((prev) => ({
                                ...prev,
                                [provider.provider]: {
                                  ...prev[provider.provider],
                                  model: e.target.value
                                }
                              }))
                            }
                            placeholder={meta.defaultModelPlaceholder}
                            className="glass-input mt-1 !py-2"
                          />
                        </div>
                      </div>

                      {/* Toggles */}
                      <div className="flex flex-wrap items-center gap-6 pt-1 text-sm">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.isEnabled}
                            onChange={(e) =>
                              setProviderForms((prev) => ({
                                ...prev,
                                [provider.provider]: {
                                  ...prev[provider.provider],
                                  isEnabled: e.target.checked
                                }
                              }))
                            }
                            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                          />
                          <span className="font-medium text-zinc-700">Enabled</span>
                        </label>

                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.isDefault}
                            onChange={(e) =>
                              setProviderForms((prev) => ({
                                ...prev,
                                [provider.provider]: {
                                  ...prev[provider.provider],
                                  isDefault: e.target.checked
                                }
                              }))
                            }
                            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                          />
                          <span className="font-medium text-zinc-700">Default Provider</span>
                        </label>
                      </div>

                      {/* Inline Status / Test Result */}
                      {status && (
                        <div
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                            status.ok
                              ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800'
                              : 'border-rose-200 bg-rose-50/90 text-rose-800'
                          }`}
                        >
                          {status.ok ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 shrink-0" />
                          )}
                          <span>{status.message}</span>
                        </div>
                      )}

                      {testResult && (
                        <div
                          className={`rounded-xl border px-3 py-2 text-xs ${
                            testResult.ok
                              ? 'border-emerald-200 bg-emerald-50/90 text-emerald-900'
                              : 'border-rose-200 bg-rose-50/90 text-rose-900'
                          }`}
                        >
                          <div className="flex items-center justify-between font-semibold">
                            <span>
                              {testResult.ok ? 'Connection OK' : 'Connection Failed'} (
                              {testResult.model || 'default'})
                            </span>
                            <span>{testResult.latencyMs}ms</span>
                          </div>
                          <p className="mt-0.5 text-[11px] opacity-90">{testResult.message}</p>
                        </div>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-zinc-200/70 pt-4">
                      <button
                        type="button"
                        onClick={() => void handleSaveProvider(provider.provider)}
                        disabled={isSaving}
                        className="glass-btn-primary !py-2"
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save Provider
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleTestProvider(provider.provider)}
                        disabled={isTesting}
                        className="glass-btn-secondary !py-2"
                      >
                        {isTesting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4 text-zinc-700" />
                        )}
                        Test Connection
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section B: Per-Task Specialist Routing */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-200/70 pb-2.5">
              <Cpu className="h-5 w-5 text-zinc-700" />
              <h2 className="text-lg font-bold text-zinc-900">
                Section B — Per-Task Specialist Routing
              </h2>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {routes.map((route) => {
                const meta = TASK_META[route.taskType];
                const Icon = meta.icon;
                const form = routeForms[route.taskType];
                const presets = MODEL_PRESETS_BY_PROVIDER[form.provider];
                const status = routeStatus[route.taskType];
                const isSaving = savingRoute === route.taskType;
                const isResetting = resettingRoute === route.taskType;

                return (
                  <div
                    key={route.taskType}
                    className={`flex flex-col justify-between p-5 ${
                      route.taskType === 'audio' ? 'glass-panel-strong' : 'glass-panel'
                    }`}
                  >
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200/80 bg-white/80 text-zinc-900 shadow-sm">
                            <Icon className="h-5 w-5" />
                          </span>
                          <div>
                            <h3 className="text-base font-bold text-zinc-900">{meta.title}</h3>
                            <p className="text-xs text-zinc-600">{meta.subtitle}</p>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${sourceBadgeClasses(
                            route.source
                          )}`}
                        >
                          {routeSourceLabel(route.source)}
                        </span>
                      </div>

                      {meta.highlightNote && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200/80 bg-white/70 px-3 py-2 text-xs text-zinc-700">
                          <span>{meta.highlightNote}</span>
                          <button
                            type="button"
                            onClick={applyWhisperPreset}
                            className="glass-btn-primary !rounded-lg !px-2.5 !py-1 !text-[11px]"
                          >
                            1-Click OpenAI Whisper-1
                          </button>
                        </div>
                      )}

                      {/* Provider */}
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700">
                          Provider
                        </label>
                        <select
                          value={form.provider}
                          onChange={(e) => {
                            const nextProvider = e.target.value as AiProviderId;
                            setRouteForms((prev) => ({
                              ...prev,
                              [route.taskType]: {
                                ...prev[route.taskType],
                                provider: nextProvider
                              }
                            }));
                          }}
                          className="glass-input mt-1 !py-2"
                        >
                          <option value="google">Google Gemini</option>
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic</option>
                          <option value="openrouter">OpenRouter</option>
                        </select>
                      </div>

                      {/* Model + Presets */}
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700">
                          Model ID
                        </label>
                        <input
                          type="text"
                          value={form.model}
                          onChange={(e) =>
                            setRouteForms((prev) => ({
                              ...prev,
                              [route.taskType]: {
                                ...prev[route.taskType],
                                model: e.target.value
                              }
                            }))
                          }
                          placeholder="Enter model identifier"
                          className="glass-input mt-1 !py-2"
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {presets.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() =>
                                setRouteForms((prev) => ({
                                  ...prev,
                                  [route.taskType]: {
                                    ...prev[route.taskType],
                                    model: preset
                                  }
                                }))
                              }
                              className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                form.model === preset
                                  ? 'border-zinc-900 bg-zinc-900 text-white'
                                  : 'border-zinc-200/80 bg-white/70 text-zinc-700 hover:border-zinc-400'
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Thinking / Reasoning Effort & Max Tokens */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700">
                            Thinking / Reasoning Effort
                          </label>
                          <select
                            value={form.thinkingEffort}
                            onChange={(e) =>
                              setRouteForms((prev) => ({
                                ...prev,
                                [route.taskType]: {
                                  ...prev[route.taskType],
                                  thinkingEffort: e.target.value
                                }
                              }))
                            }
                            className="glass-input mt-1 !py-2"
                          >
                            {THINKING_EFFORT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700">
                            Max Tokens
                          </label>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={form.maxTokens}
                            onChange={(e) =>
                              setRouteForms((prev) => ({
                                ...prev,
                                [route.taskType]: {
                                  ...prev[route.taskType],
                                  maxTokens: e.target.value
                                }
                              }))
                            }
                            placeholder="Default"
                            className="glass-input mt-1 !py-2"
                          />
                        </div>
                      </div>
                      {route.taskType === 'audio' && (
                        <p className="text-[11px] text-zinc-500">
                          Thinking effort applies to multimodal audio models (e.g. Gemini), not
                          Whisper.
                        </p>
                      )}

                      {/* Active Toggle */}
                      <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={form.isActive}
                          onChange={(e) =>
                            setRouteForms((prev) => ({
                              ...prev,
                              [route.taskType]: {
                                ...prev[route.taskType],
                                isActive: e.target.checked
                              }
                            }))
                          }
                          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                        />
                        <span className="font-medium text-zinc-700">Route Active</span>
                      </label>

                      {status && (
                        <div
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                            status.ok
                              ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800'
                              : 'border-rose-200 bg-rose-50/90 text-rose-800'
                          }`}
                        >
                          {status.ok ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 shrink-0" />
                          )}
                          <span>{status.message}</span>
                        </div>
                      )}
                    </div>

                    {/* Route Actions */}
                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-zinc-200/70 pt-4">
                      <button
                        type="button"
                        onClick={() => void handleSaveRoute(route.taskType)}
                        disabled={isSaving}
                        className="glass-btn-primary !py-2"
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save Route
                      </button>

                      {route.source === 'database' && (
                        <button
                          type="button"
                          onClick={() => void handleResetRoute(route.taskType)}
                          disabled={isResetting}
                          className="glass-btn-secondary !py-2 !px-3 !text-xs"
                        >
                          {isResetting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          Reset to .env Fallback
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </PageEntrance>
  );
}
