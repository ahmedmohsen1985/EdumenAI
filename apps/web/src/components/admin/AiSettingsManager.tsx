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
  fetchAiSettings,
  resetAiTaskRoute,
  saveAiProviderConfig,
  saveAiTaskRoute,
  testAiProvider,
  type AiProviderTestResult
} from '../../lib/admin-settings-api';

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
  temperature: string;
  maxTokens: string;
  isActive: boolean;
}

function sourceBadgeClasses(source: 'database' | 'env' | 'default' | 'none'): string {
  if (source === 'database') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (source === 'env') {
    return 'bg-sky-50 text-sky-700 border-sky-200';
  }
  if (source === 'default') {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  return 'bg-slate-100 text-slate-600 border-slate-200';
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
  const [providers, setProviders] = useState<AiProviderConfigView[]>([]);
  const [routes, setRoutes] = useState<AiTaskRouteView[]>([]);
  const [providerForms, setProviderForms] = useState<Record<AiProviderId, ProviderFormState>>({
    google: { apiKey: '', showKey: false, baseUrl: '', model: '', isEnabled: true, isDefault: false },
    openai: { apiKey: '', showKey: false, baseUrl: '', model: '', isEnabled: true, isDefault: false },
    anthropic: { apiKey: '', showKey: false, baseUrl: '', model: '', isEnabled: true, isDefault: false },
    openrouter: { apiKey: '', showKey: false, baseUrl: '', model: '', isEnabled: true, isDefault: false }
  });
  const [routeForms, setRouteForms] = useState<Record<AiTaskType, RouteFormState>>({
    vision: { provider: 'google', model: '', temperature: '', maxTokens: '', isActive: true },
    evaluation: { provider: 'google', model: '', temperature: '', maxTokens: '', isActive: true },
    audio: { provider: 'openai', model: 'whisper-1', temperature: '', maxTokens: '', isActive: true }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
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
            temperature:
              r.temperature !== null && r.temperature !== undefined ? String(r.temperature) : '',
            maxTokens: r.maxTokens !== null && r.maxTokens !== undefined ? String(r.maxTokens) : '',
            isActive: r.isActive
          };
        }
        return next;
      });
    },
    []
  );

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAiSettings();
      hydrateFromData(data);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load AI settings.');
    } finally {
      setIsLoading(false);
    }
  }, [hydrateFromData]);

  useEffect(() => {
    void loadSettings();
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

    let temperature: number | null = null;
    if (form.temperature.trim() !== '') {
      const parsedTemp = Number(form.temperature);
      if (!Number.isFinite(parsedTemp) || parsedTemp < 0 || parsedTemp > 2) {
        setRouteStatus((prev) => ({
          ...prev,
          [taskType]: { ok: false, message: 'Temperature must be between 0 and 2.' }
        }));
        return;
      }
      temperature = parsedTemp;
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
        temperature,
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">AI Providers &amp; Task Routing</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage encrypted provider credentials and route Vision, Evaluation, and Audio tasks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSettings()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-brand-navy" />
          <span className="text-sm font-medium text-slate-700">Loading AI configuration...</span>
        </div>
      ) : (
        <>
          {/* Section A: AI Provider Credentials */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
              <KeyRound className="h-5 w-5 text-brand-gold" />
              <h2 className="text-lg font-bold text-brand-navy">
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
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="space-y-4">
                      {/* Card Header */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-brand-gold">
                            <Bot className="h-5 w-5" />
                          </span>
                          <div>
                            <h3 className="text-base font-bold text-brand-navy">{meta.title}</h3>
                            <p className="text-xs text-slate-500">{meta.subtitle}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${sourceBadgeClasses(
                              provider.source
                            )}`}
                          >
                            {providerSourceLabel(provider.source)}
                          </span>
                          {provider.isDefault && (
                            <span className="rounded-full bg-brand-cream border border-brand-gold/50 px-2.5 py-0.5 text-xs font-semibold text-brand-navy">
                              Default
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Masked Key Pill */}
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs border border-slate-200">
                        <span className="font-medium text-slate-600">Stored Key:</span>
                        <span className="font-mono font-semibold text-brand-navy">
                          {provider.hasApiKey && provider.apiKeyMasked
                            ? provider.apiKeyMasked
                            : 'Not set'}
                        </span>
                      </div>

                      {/* API Key Input */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
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
                            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-navy focus:outline-none"
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
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
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
                          <label className="block text-xs font-semibold text-slate-700">
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
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-navy focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
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
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-navy focus:outline-none"
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
                            className="h-4 w-4 rounded border-slate-300 text-brand-navy focus:ring-brand-navy"
                          />
                          <span className="font-medium text-slate-700">Enabled</span>
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
                            className="h-4 w-4 rounded border-slate-300 text-brand-navy focus:ring-brand-navy"
                          />
                          <span className="font-medium text-slate-700">Default Provider</span>
                        </label>
                      </div>

                      {/* Inline Status / Test Result */}
                      {status && (
                        <div
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                            status.ok
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-red-200 bg-red-50 text-red-800'
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
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                              : 'border-red-200 bg-red-50 text-red-900'
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
                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        onClick={() => void handleSaveProvider(provider.provider)}
                        disabled={isSaving}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 text-brand-gold" />
                        )}
                        Save Provider
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleTestProvider(provider.provider)}
                        disabled={isTesting}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {isTesting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4 text-brand-gold" />
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
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
              <Cpu className="h-5 w-5 text-brand-gold" />
              <h2 className="text-lg font-bold text-brand-navy">
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
                    className={`flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-sm ${
                      route.taskType === 'audio'
                        ? 'border-brand-gold/60 bg-brand-cream/20'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-cream border border-brand-gold/40 text-brand-navy">
                            <Icon className="h-5 w-5" />
                          </span>
                          <div>
                            <h3 className="text-base font-bold text-brand-navy">{meta.title}</h3>
                            <p className="text-xs text-slate-600">{meta.subtitle}</p>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${sourceBadgeClasses(
                            route.source
                          )}`}
                        >
                          {routeSourceLabel(route.source)}
                        </span>
                      </div>

                      {meta.highlightNote && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-gold/40 bg-brand-cream px-3 py-2 text-xs text-brand-navy">
                          <span>{meta.highlightNote}</span>
                          <button
                            type="button"
                            onClick={applyWhisperPreset}
                            className="rounded-lg bg-brand-navy px-2.5 py-1 text-[11px] font-semibold text-brand-gold hover:bg-brand-navy/90"
                          >
                            1-Click OpenAI Whisper-1
                          </button>
                        </div>
                      )}

                      {/* Provider */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
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
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-navy focus:outline-none"
                        >
                          <option value="google">Google Gemini</option>
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic</option>
                          <option value="openrouter">OpenRouter</option>
                        </select>
                      </div>

                      {/* Model + Presets */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
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
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-navy focus:outline-none"
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
                              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                form.model === preset
                                  ? 'border-brand-navy bg-brand-navy text-white'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-brand-gold'
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Temperature & Max Tokens */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            Temperature (0–2)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={2}
                            step={0.1}
                            value={form.temperature}
                            onChange={(e) =>
                              setRouteForms((prev) => ({
                                ...prev,
                                [route.taskType]: {
                                  ...prev[route.taskType],
                                  temperature: e.target.value
                                }
                              }))
                            }
                            placeholder="Default"
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-navy focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
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
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-navy focus:outline-none"
                          />
                        </div>
                      </div>

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
                          className="h-4 w-4 rounded border-slate-300 text-brand-navy focus:ring-brand-navy"
                        />
                        <span className="font-medium text-slate-700">Route Active</span>
                      </label>

                      {status && (
                        <div
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                            status.ok
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-red-200 bg-red-50 text-red-800'
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
                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                      <button
                        type="button"
                        onClick={() => void handleSaveRoute(route.taskType)}
                        disabled={isSaving}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 text-brand-gold" />
                        )}
                        Save Route
                      </button>

                      {route.source === 'database' && (
                        <button
                          type="button"
                          onClick={() => void handleResetRoute(route.taskType)}
                          disabled={isResetting}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
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
    </div>
  );
}
