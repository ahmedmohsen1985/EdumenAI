'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Coins,
  Cpu,
  FileEdit,
  Layers,
  Loader2,
  Sparkles
} from 'lucide-react';
import type { TokenMetricsResponse } from '@edumenai/shared';
import {
  ADMIN_EXERCISES_CACHE_KEYS,
  fetchAdminExercises,
  fetchAdminPlatformStats,
  type AdminExerciseSummary,
  type AdminPlatformStats
} from '../../lib/admin-exercises-api';
import { fetchTokenMetrics } from '../../lib/admin-settings-api';
import { getCached, isCacheFresh } from '../../lib/client-cache';
import { PageEntrance, StaggerCard, StaggerGrid } from '../../components/ui/MotionPrimitives';

export default function AdminOverviewPage(): React.ReactElement {
  const cachedExercises = getCached<AdminExerciseSummary[]>(ADMIN_EXERCISES_CACHE_KEYS.exercises);
  const cachedStats = getCached<AdminPlatformStats>(ADMIN_EXERCISES_CACHE_KEYS.stats);
  const hasBothCached = cachedExercises !== null && cachedStats !== null;

  const [exercises, setExercises] = useState<AdminExerciseSummary[]>(cachedExercises ?? []);
  const [stats, setStats] = useState<AdminPlatformStats | null>(cachedStats);
  const [tokenMetrics, setTokenMetrics] = useState<TokenMetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!hasBothCached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchTokenMetrics(30)
      .then((res) => {
        if (!cancelled) setTokenMetrics(res);
      })
      .catch(() => {
        // Non-blocking overview card
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fresh =
      hasBothCached &&
      isCacheFresh(ADMIN_EXERCISES_CACHE_KEYS.exercises, 30_000) &&
      isCacheFresh(ADMIN_EXERCISES_CACHE_KEYS.stats, 30_000);
    if (fresh) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    if (!hasBothCached) {
      setIsLoading(true);
    }
    setError(null);

    void Promise.all([fetchAdminExercises(), fetchAdminPlatformStats()])
      .then(([exList, platformStats]) => {
        if (cancelled) return;
        setExercises(exList);
        setStats(platformStats);
      })
      .catch((err: unknown) => {
        if (!cancelled && !hasBothCached) {
          setError(err instanceof Error ? err.message : 'Failed to load admin overview.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasBothCached]);

  if (isLoading) {
    return (
      <div className="glass-panel flex items-center gap-3 p-8">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
        <span className="text-sm font-medium text-zinc-700">
          Loading Admin Studio metrics...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel-strong flex items-start gap-3 border-rose-200/80 bg-rose-50/75 p-6 text-rose-900">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
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
    <PageEntrance className="space-y-6">
      {/* Editorial Frosted Header Card */}
      <div className="glass-panel-strong relative overflow-hidden px-6 py-7 sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-gradient-to-br from-white/90 via-zinc-200/50 to-transparent blur-2xl"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="glass-pill">
              <Sparkles className="h-3.5 w-3.5 text-zinc-600" />
              EdumenAI Admin Studio
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              Platform Control Center
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-zinc-600">
              Design Lego assessment templates, manage versioned AI prompts, configure specialist
              AI providers, and route Telegram delivery groups.
            </p>
          </div>
          <Link href="/admin/exercises" className="glass-btn-primary">
            <Layers className="h-4 w-4" />
            Open Exercises &amp; Builder
          </Link>
        </div>
      </div>

      {/* Top KPI Grid */}
      <StaggerGrid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerCard className="glass-panel p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Total Exercises
          </div>
          <div className="mt-2 text-3xl font-extrabold text-zinc-900">{totalExercises}</div>
          <p className="mt-1 text-xs text-zinc-500">Across Writing, Reading, Listening, Speaking</p>
        </StaggerCard>

        <StaggerCard className="glass-panel border-emerald-200/70 bg-emerald-50/45 p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
            Published Live
          </div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-950">{publishedCount}</div>
          <p className="mt-1 text-xs text-emerald-700">Available in student portal</p>
        </StaggerCard>

        <StaggerCard className="glass-panel border-amber-200/70 bg-amber-50/45 p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
            Active Drafts
          </div>
          <div className="mt-2 text-3xl font-extrabold text-amber-950">{withDraftsCount}</div>
          <p className="mt-1 text-xs text-amber-800">Unpublished edits in progress</p>
        </StaggerCard>

        <StaggerCard className="glass-panel p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            AI Keys Ready
          </div>
          <div className="mt-2 text-3xl font-extrabold text-zinc-900">
            {activeProvidersCount}{' '}
            <span className="text-base font-medium text-zinc-400">
              / {stats?.aiProviders.length ?? 4}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Encrypted DB or .env providers</p>
        </StaggerCard>
      </StaggerGrid>

      {/* Runtime Summary Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI Routing Summary */}
        <div className="glass-panel p-6">
          <div className="flex items-center justify-between border-b border-zinc-200/70 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-zinc-700" />
              <h2 className="text-base font-bold text-zinc-900">Active AI Specialist Routes</h2>
            </div>
            <Link
              href="/admin/settings/ai"
              className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 hover:text-zinc-900 hover:underline"
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
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200/70 bg-white/60 px-4 py-3"
              >
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {title}
                  </div>
                  <div className="mt-0.5 text-sm font-bold text-zinc-900">
                    {route ? `${route.provider} · ${route.model}` : 'Not resolved'}
                  </div>
                </div>
                {route && (
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      route.source === 'database'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : route.source === 'env'
                          ? 'border-zinc-200 bg-white/80 text-zinc-700'
                          : 'border-zinc-200 bg-zinc-100 text-zinc-600'
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
        <div className="glass-panel p-6">
          <div className="flex items-center justify-between border-b border-zinc-200/70 pb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-zinc-700" />
              <h2 className="text-base font-bold text-zinc-900">Telegram Bot &amp; Targets</h2>
            </div>
            <Link
              href="/admin/integrations/telegram"
              className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 hover:text-zinc-900 hover:underline"
            >
              Manage Telegram
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-zinc-200/70 bg-white/60 px-4 py-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Bot Status
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-zinc-900">
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
              <span className="glass-pill">
                Source: {stats?.telegramConfig.source ?? 'none'}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-zinc-200/70 bg-white/60 px-4 py-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Configured Teacher Groups
                </div>
                <div className="mt-0.5 text-sm font-bold text-zinc-900">
                  {activeTargetsCount} active / {totalTargetsCount} total
                </div>
              </div>
              <Link
                href="/admin/integrations/telegram"
                className="glass-btn-secondary !rounded-lg !px-3 !py-1.5 !text-xs"
              >
                Test &amp; Edit
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 30-Day Token Usage & Credits Summary Card */}
      <div className="glass-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/70 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-zinc-700" />
            <h2 className="text-base font-bold text-zinc-900">
              Token Usage &amp; Credits (Last 30 Days)
            </h2>
          </div>
          <Link
            href="/admin/settings/ai"
            className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 hover:text-zinc-900 hover:underline"
          >
            View Metrics &amp; Billing
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-200/70 bg-white/60 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Total Tokens
            </div>
            <div className="mt-1 text-xl font-extrabold tabular-nums text-zinc-900">
              {tokenMetrics ? tokenMetrics.summary.totalTokens.toLocaleString('en-US') : '—'}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200/70 bg-white/60 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Evaluations
            </div>
            <div className="mt-1 text-xl font-extrabold tabular-nums text-zinc-900">
              {tokenMetrics ? tokenMetrics.summary.totalEvaluations.toLocaleString('en-US') : '—'}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200/70 bg-white/60 px-4 py-3">
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              <Coins className="h-3 w-3" />
              Credits Deducted
            </div>
            <div className="mt-1 text-xl font-extrabold tabular-nums text-zinc-900">
              {tokenMetrics
                ? tokenMetrics.summary.totalCreditsDeducted.toLocaleString('en-US')
                : '—'}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200/70 bg-white/60 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Avg Latency
            </div>
            <div className="mt-1 text-xl font-extrabold tabular-nums text-zinc-900">
              {tokenMetrics && tokenMetrics.summary.avgLatencyMs > 0
                ? `${(tokenMetrics.summary.avgLatencyMs / 1000).toFixed(1)}s`
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Cards */}
      <StaggerGrid className="grid gap-4 md:grid-cols-3">
        <StaggerCard>
          <Link href="/admin/exercises" className="glass-card group block p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm">
                <FileEdit className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 group-hover:underline">
                  Exercises &amp; Lego Builder
                </h3>
                <p className="text-xs text-zinc-500">
                  Create skills, drag &amp; drop blocks, edit prompts
                </p>
              </div>
            </div>
          </Link>
        </StaggerCard>

        <StaggerCard>
          <Link href="/admin/settings/ai" className="glass-card group block p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 group-hover:underline">
                  AI Providers &amp; Routing
                </h3>
                <p className="text-xs text-zinc-500">
                  Google, OpenAI, Anthropic, OpenRouter &amp; Audio
                </p>
              </div>
            </div>
          </Link>
        </StaggerCard>

        <StaggerCard>
          <Link href="/admin/integrations/telegram" className="glass-card group block p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 group-hover:underline">
                  Telegram Bot &amp; Groups
                </h3>
                <p className="text-xs text-zinc-500">
                  Encrypted bot token, multi-group targets &amp; test
                </p>
              </div>
            </div>
          </Link>
        </StaggerCard>
      </StaggerGrid>
    </PageEntrance>
  );
}
