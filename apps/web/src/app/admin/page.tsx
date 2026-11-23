'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Cpu,
  FileEdit,
  Layers,
  Loader2,
  Sparkles
} from 'lucide-react';
import {
  fetchAdminExercises,
  fetchAdminPlatformStats,
  type AdminExerciseSummary,
  type AdminPlatformStats
} from '../../lib/admin-exercises-api';

export default function AdminOverviewPage(): React.ReactElement {
  const [exercises, setExercises] = useState<AdminExerciseSummary[]>([]);
  const [stats, setStats] = useState<AdminPlatformStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void Promise.all([fetchAdminExercises(), fetchAdminPlatformStats()])
      .then(([exList, platformStats]) => {
        if (cancelled) return;
        setExercises(exList);
        setStats(platformStats);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load admin overview.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-brand-navy" />
        <span className="text-sm font-medium text-slate-700">
          Loading Admin Studio metrics...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h2 className="font-bold">Failed to load dashboard</h2>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const totalExercises = exercises.length;
  const publishedCount = exercises.filter((e) => e.activeVersion !== null).length;
  const withDraftsCount = exercises.filter((e) => e.latestDraft !== null).length;

  const visionRoute = stats?.aiRoutes.find((r) => r.taskType === 'vision');
  const evalRoute = stats?.aiRoutes.find((r) => r.taskType === 'evaluation');
  const audioRoute = stats?.aiRoutes.find((r) => r.taskType === 'audio');
  const activeProvidersCount =
    stats?.aiProviders.filter((p) => p.hasApiKey && p.isEnabled).length ?? 0;

  const activeTargetsCount = stats?.telegramTargets.filter((t) => t.isActive).length ?? 0;
  const totalTargetsCount = stats?.telegramTargets.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl bg-brand-navy px-6 py-7 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold/20 px-3 py-1 text-xs font-semibold text-brand-gold">
              <Sparkles className="h-3.5 w-3.5" />
              EdumenAI Admin Studio
            </span>
            <h1 className="mt-2.5 text-2xl font-bold">Platform Control Center</h1>
            <p className="mt-1 text-sm text-slate-300">
              Design Lego assessment templates, manage versioned AI prompts, configure specialist
              AI providers, and route Telegram delivery groups.
            </p>
          </div>
          <Link
            href="/admin/exercises"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand-navy shadow-sm transition hover:bg-brand-goldLight"
          >
            <Layers className="h-4 w-4" />
            Open Exercises &amp; Builder
          </Link>
        </div>
      </div>

      {/* Top KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Total Exercises
          </div>
          <div className="mt-2 text-3xl font-extrabold text-brand-navy">{totalExercises}</div>
          <p className="mt-1 text-xs text-slate-500">Across Writing, Reading, Listening, Speaking</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
            Published Live
          </div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-900">{publishedCount}</div>
          <p className="mt-1 text-xs text-emerald-700">Available in student portal</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
            Active Drafts
          </div>
          <div className="mt-2 text-3xl font-extrabold text-amber-950">{withDraftsCount}</div>
          <p className="mt-1 text-xs text-amber-800">Unpublished edits in progress</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            AI Keys Ready
          </div>
          <div className="mt-2 text-3xl font-extrabold text-brand-navy">
            {activeProvidersCount}{' '}
            <span className="text-base font-medium text-slate-400">
              / {stats?.aiProviders.length ?? 4}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Encrypted DB or .env providers</p>
        </div>
      </div>

      {/* Runtime Summary Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI Routing Summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-brand-navy" />
              <h2 className="text-base font-bold text-brand-navy">Active AI Specialist Routes</h2>
            </div>
            <Link
              href="/admin/settings/ai"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-navy hover:underline"
            >
              Configure AI
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {[
              { title: 'Vision / OCR', route: visionRoute },
              { title: 'Evaluation / Marking', route: evalRoute },
              { title: 'Audio / Speech-to-Text', route: audioRoute }
            ].map(({ title, route }) => (
              <div
                key={title}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {title}
                  </div>
                  <div className="mt-0.5 text-sm font-bold text-brand-navy">
                    {route ? `${route.provider} · ${route.model}` : 'Not resolved'}
                  </div>
                </div>
                {route && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      route.source === 'database'
                        ? 'bg-brand-navy text-brand-gold'
                        : route.source === 'env'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {route.source === 'database'
                      ? 'DB Override'
                      : route.source === 'env'
                        ? '.env Fallback'
                        : 'Default'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Telegram Summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-brand-navy" />
              <h2 className="text-base font-bold text-brand-navy">Telegram Bot &amp; Targets</h2>
            </div>
            <Link
              href="/admin/integrations/telegram"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-navy hover:underline"
            >
              Manage Telegram
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Bot Status
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-brand-navy">
                  {stats?.telegramConfig.hasBotToken && stats.telegramConfig.isEnabled ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>Enabled ({stats.telegramConfig.botTokenMasked})</span>
                    </>
                  ) : (
                    <span>
                      {stats?.telegramConfig.hasBotToken ? 'Disabled' : 'Token Not Configured'}
                    </span>
                  )}
                </div>
              </div>
              <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                Source: {stats?.telegramConfig.source ?? 'none'}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Configured Teacher Groups
                </div>
                <div className="mt-0.5 text-sm font-bold text-brand-navy">
                  {activeTargetsCount} active / {totalTargetsCount} total
                </div>
              </div>
              <Link
                href="/admin/integrations/telegram"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Test &amp; Edit
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/admin/exercises"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-gold hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-brand-gold">
              <FileEdit className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-brand-navy group-hover:underline">
                Exercises &amp; Lego Builder
              </h3>
              <p className="text-xs text-slate-500">
                Create skills, drag &amp; drop blocks, edit prompts
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/settings/ai"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-gold hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-brand-gold">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-brand-navy group-hover:underline">
                AI Providers &amp; Routing
              </h3>
              <p className="text-xs text-slate-500">
                Google, OpenAI, Anthropic, OpenRouter &amp; Audio
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/integrations/telegram"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-gold hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-brand-gold">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-brand-navy group-hover:underline">
                Telegram Bot &amp; Groups
              </h3>
              <p className="text-xs text-slate-500">
                Encrypted bot token, multi-group targets &amp; test
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
