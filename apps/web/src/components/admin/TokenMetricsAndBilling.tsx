'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { PlatformBillingConfigView, TokenMetricsResponse } from '@edumenai/shared';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Coins,
  Clock,
  Layers,
  Loader2,
  RefreshCw,
  Save,
  Sparkles
} from 'lucide-react';
import {
  fetchBillingConfig,
  fetchTokenMetrics,
  updateBillingConfig
} from '../../lib/admin-settings-api';
import { SlidingTabButton } from '../ui/MotionPrimitives';

const PERIOD_OPTIONS = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' }
] as const;

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function TokenMetricsAndBilling(): React.ReactElement {
  // Token metrics state
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [metrics, setMetrics] = useState<TokenMetricsResponse | null>(null);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  // Billing config state
  const [billing, setBilling] = useState<PlatformBillingConfigView | null>(null);
  const [tokensPerCredit, setTokensPerCredit] = useState<string>('1000');
  const [welcomeBonusCredits, setWelcomeBonusCredits] = useState<string>('50');
  const [lowCreditThreshold, setLowCreditThreshold] = useState<string>('10');
  const [enforceCredits, setEnforceCredits] = useState<boolean>(false);
  const [billingLoading, setBillingLoading] = useState<boolean>(true);
  const [billingSaving, setBillingSaving] = useState<boolean>(false);
  const [billingStatus, setBillingStatus] = useState<{ ok: boolean; message: string } | null>(
    null
  );

  const loadMetrics = useCallback(async (days: number, force = false) => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const res = await fetchTokenMetrics(days, { force });
      setMetrics(res);
    } catch (err: unknown) {
      setMetricsError(err instanceof Error ? err.message : 'Failed to load token metrics.');
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const loadBilling = useCallback(async (force = false) => {
    setBillingLoading(true);
    try {
      const cfg = await fetchBillingConfig({ force });
      setBilling(cfg);
      setTokensPerCredit(String(cfg.tokensPerCredit));
      setWelcomeBonusCredits(String(cfg.welcomeBonusCredits));
      setLowCreditThreshold(String(cfg.lowCreditThreshold));
      setEnforceCredits(cfg.enforceCredits);
    } catch (err: unknown) {
      setBillingStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to load billing settings.'
      });
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics(periodDays, false);
  }, [loadMetrics, periodDays]);

  useEffect(() => {
    void loadBilling(false);
  }, [loadBilling]);

  const handleSaveBilling = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const parsedTpc = Number.parseInt(tokensPerCredit, 10);
    const parsedWelcome = Number.parseInt(welcomeBonusCredits, 10);
    const parsedLow = Number.parseInt(lowCreditThreshold, 10);

    if (!Number.isFinite(parsedTpc) || parsedTpc < 100 || parsedTpc > 100_000) {
      setBillingStatus({
        ok: false,
        message: 'Tokens per Credit must be an integer between 100 and 100,000.'
      });
      return;
    }
    if (!Number.isFinite(parsedWelcome) || parsedWelcome < 0 || parsedWelcome > 10_000) {
      setBillingStatus({
        ok: false,
        message: 'Welcome Bonus Credits must be an integer between 0 and 10,000.'
      });
      return;
    }
    if (!Number.isFinite(parsedLow) || parsedLow < 0 || parsedLow > 1_000) {
      setBillingStatus({
        ok: false,
        message: 'Low-Credit Threshold must be an integer between 0 and 1,000.'
      });
      return;
    }

    setBillingSaving(true);
    setBillingStatus(null);
    try {
      const updated = await updateBillingConfig({
        tokensPerCredit: parsedTpc,
        welcomeBonusCredits: parsedWelcome,
        lowCreditThreshold: parsedLow,
        enforceCredits
      });
      setBilling(updated);
      setBillingStatus({
        ok: true,
        message: 'Credit billing configuration saved.'
      });
    } catch (err: unknown) {
      setBillingStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to save billing settings.'
      });
    } finally {
      setBillingSaving(false);
    }
  };

  const maxExerciseTokens = metrics?.byExercise[0]?.totalTokens ?? 0;

  return (
    <div className="space-y-8">
      {/* Section 3: Token Consumption Metrics */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-zinc-950">
              <BarChart3 className="h-5 w-5 text-zinc-700" />
              Token Consumption Metrics
            </h2>
            <p className="mt-0.5 text-xs text-zinc-600">
              Non-preview AI token usage, latency, and credit deductions across providers and
              exercises.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div
              role="tablist"
              aria-label="Metrics time period"
              className="glass-panel inline-flex gap-1 p-1"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <SlidingTabButton
                  key={opt.days}
                  asTab
                  layoutId="admin-metrics-period-pill"
                  isActive={periodDays === opt.days}
                  onClick={() => setPeriodDays(opt.days)}
                  className="!rounded-lg !px-3 !py-1 !text-xs"
                >
                  {opt.label}
                </SlidingTabButton>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void loadMetrics(periodDays, true)}
              disabled={metricsLoading}
              aria-label="Refresh token metrics"
              className="glass-btn-secondary !p-2"
            >
              <RefreshCw className={`h-4 w-4 ${metricsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {metricsError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-rose-200/80 bg-rose-50/85 px-4 py-3 text-sm text-rose-800"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{metricsError}</span>
          </div>
        )}

        {metricsLoading && !metrics ? (
          <div className="glass-panel flex items-center gap-3 p-6">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
            <span className="text-sm font-medium text-zinc-700">Loading token metrics...</span>
          </div>
        ) : metrics ? (
          <div className="space-y-5">
            {/* 4 KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="glass-panel p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Total Tokens
                  </span>
                  <Sparkles className="h-4 w-4 text-zinc-400" />
                </div>
                <div className="mt-2.5 text-2xl font-extrabold tabular-nums text-zinc-950">
                  {formatNumber(metrics.summary.totalTokens)}
                </div>
                <p className="mt-1 text-[11px] tabular-nums text-zinc-500">
                  In: {formatNumber(metrics.summary.totalPromptTokens)} · Out:{' '}
                  {formatNumber(metrics.summary.totalCompletionTokens)}
                </p>
              </div>

              <div className="glass-panel p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Evaluations
                  </span>
                  <Activity className="h-4 w-4 text-zinc-400" />
                </div>
                <div className="mt-2.5 text-2xl font-extrabold tabular-nums text-zinc-950">
                  {formatNumber(metrics.summary.totalEvaluations)}
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">Last {metrics.periodDays} days</p>
              </div>

              <div className="glass-panel p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Credits Deducted
                  </span>
                  <Coins className="h-4 w-4 text-zinc-400" />
                </div>
                <div className="mt-2.5 text-2xl font-extrabold tabular-nums text-zinc-950">
                  {formatNumber(metrics.summary.totalCreditsDeducted)}
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">OCR &amp; grading ledger total</p>
              </div>

              <div className="glass-panel p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Avg Latency
                  </span>
                  <Clock className="h-4 w-4 text-zinc-400" />
                </div>
                <div className="mt-2.5 text-2xl font-extrabold tabular-nums text-zinc-950">
                  {metrics.summary.avgLatencyMs > 0
                    ? `${(metrics.summary.avgLatencyMs / 1000).toFixed(1)}s`
                    : '—'}
                </div>
                <p className="mt-1 text-[11px] tabular-nums text-zinc-500">
                  {metrics.summary.avgLatencyMs > 0
                    ? `${formatNumber(metrics.summary.avgLatencyMs)} ms mean`
                    : 'No latency data yet'}
                </p>
              </div>
            </div>

            {/* Breakdown Tables */}
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Provider / Model Breakdown */}
              <div className="glass-panel-strong overflow-hidden">
                <div className="border-b border-zinc-900/[0.06] px-5 py-3.5">
                  <h3 className="text-sm font-bold text-zinc-950">Provider &amp; Model Breakdown</h3>
                </div>
                {metrics.byProviderModel.length === 0 ? (
                  <p className="px-5 py-8 text-center text-xs text-zinc-500">
                    No evaluations recorded in the last {metrics.periodDays} days.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-zinc-900/[0.06] bg-white/50 font-bold uppercase tracking-wider text-zinc-500">
                        <tr>
                          <th className="px-4 py-2.5">Provider / Model</th>
                          <th className="px-4 py-2.5 text-right">Runs</th>
                          <th className="px-4 py-2.5 text-right">Tokens</th>
                          <th className="px-4 py-2.5 text-right">Latency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900/[0.05]">
                        {metrics.byProviderModel.map((row) => (
                          <tr key={`${row.provider}:${row.model}`} className="hover:bg-white/60">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-zinc-900">{row.model}</div>
                              <div className="text-[11px] uppercase text-zinc-500">
                                {row.provider}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums text-zinc-800">
                              {formatNumber(row.evaluations)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold tabular-nums text-zinc-950">
                              {formatNumber(row.totalTokens)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                              {row.avgLatencyMs > 0
                                ? `${(row.avgLatencyMs / 1000).toFixed(1)}s`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Top Exercises Breakdown */}
              <div className="glass-panel-strong overflow-hidden">
                <div className="flex items-center justify-between border-b border-zinc-900/[0.06] px-5 py-3.5">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-zinc-950">
                    <Layers className="h-4 w-4 text-zinc-500" />
                    Top Exercises by Token Usage
                  </h3>
                </div>
                {metrics.byExercise.length === 0 ? (
                  <p className="px-5 py-8 text-center text-xs text-zinc-500">
                    No exercise token consumption recorded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-900/[0.05] px-5 py-2">
                    {metrics.byExercise.map((ex) => {
                      const pct =
                        maxExerciseTokens > 0
                          ? Math.max(4, Math.round((ex.totalTokens / maxExerciseTokens) * 100))
                          : 0;
                      return (
                        <div key={ex.exerciseCode} className="py-3">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div className="min-w-0 truncate">
                              <span className="font-semibold text-zinc-900">
                                {ex.exerciseTitle}
                              </span>
                              <span className="ml-2 font-mono text-[11px] text-zinc-400">
                                {ex.exerciseCode}
                              </span>
                            </div>
                            <span className="shrink-0 whitespace-nowrap font-bold tabular-nums text-zinc-900">
                              {formatNumber(ex.totalTokens)} tok · {ex.evaluations}x
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-900/[0.07]">
                            <div
                              className="h-full rounded-full bg-zinc-900 transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* Section 4: Credit Billing & Low-Credit Threshold */}
      <section className="glass-panel-strong p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-900/[0.06] pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-zinc-950">
              <Coins className="h-5 w-5 text-zinc-700" />
              Credit Billing &amp; Low-Credit Threshold
            </h2>
            <p className="mt-0.5 text-xs text-zinc-600">
              Configure token-to-credit conversion, student welcome bonus credits, low-balance
              warnings, and strict credit enforcement.
            </p>
          </div>
          {billing?.updatedAt && (
            <span className="glass-pill">
              Updated {new Date(billing.updatedAt).toLocaleDateString('en-GB')}
            </span>
          )}
        </div>

        {billingLoading ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-zinc-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading billing configuration...
          </div>
        ) : (
          <form onSubmit={(e) => void handleSaveBilling(e)} className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="billing-tpc"
                  className="mb-1 block text-xs font-semibold text-zinc-600"
                >
                  Tokens per Credit
                </label>
                <input
                  id="billing-tpc"
                  type="number"
                  min={100}
                  max={100000}
                  step={100}
                  value={tokensPerCredit}
                  onChange={(e) => setTokensPerCredit(e.target.value)}
                  className="glass-input"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Minimum 1 credit deducted per AI call (ceil(tokens / rate)).
                </p>
              </div>

              <div>
                <label
                  htmlFor="billing-welcome"
                  className="mb-1 block text-xs font-semibold text-zinc-600"
                >
                  Welcome Bonus Credits
                </label>
                <input
                  id="billing-welcome"
                  type="number"
                  min={0}
                  max={10000}
                  value={welcomeBonusCredits}
                  onChange={(e) => setWelcomeBonusCredits(e.target.value)}
                  className="glass-input"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Granted automatically to newly registered student accounts.
                </p>
              </div>

              <div>
                <label
                  htmlFor="billing-low"
                  className="mb-1 block text-xs font-semibold text-zinc-600"
                >
                  Low-Credit Warning Threshold
                </label>
                <input
                  id="billing-low"
                  type="number"
                  min={0}
                  max={1000}
                  value={lowCreditThreshold}
                  onChange={(e) => setLowCreditThreshold(e.target.value)}
                  className="glass-input"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Shows amber warning banners &amp; triggers a notification when crossed.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-900/[0.06] bg-white/60 p-4">
              <div>
                <div className="text-sm font-bold text-zinc-950">Enforce Credit Balance</div>
                <p className="mt-0.5 text-xs text-zinc-600">
                  When enabled, students or sponsoring instructors with 0 credits remaining cannot
                  run OCR or AI evaluation until topped up.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enforceCredits}
                onClick={() => setEnforceCredits((prev) => !prev)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/15 ${
                  enforceCredits ? 'bg-zinc-900' : 'bg-zinc-300'
                }`}
              >
                <span className="sr-only">Enforce credit balance</span>
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    enforceCredits ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {billingStatus && (
              <div
                role="status"
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium ${
                  billingStatus.ok
                    ? 'border-emerald-200/80 bg-emerald-50/85 text-emerald-800'
                    : 'border-rose-200/80 bg-rose-50/85 text-rose-800'
                }`}
              >
                {billingStatus.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{billingStatus.message}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button type="submit" disabled={billingSaving} className="glass-btn-primary">
                {billingSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Billing Settings
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
