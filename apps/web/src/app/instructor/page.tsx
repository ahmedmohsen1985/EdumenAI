'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Clock,
  FileText,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Users
} from 'lucide-react';
import {
  fetchInstructorOverview,
  INSTRUCTOR_CACHE_KEYS,
  type InstructorOverviewStats
} from '../../lib/instructor-api';
import { getCached, isCacheFresh } from '../../lib/client-cache';
import { useAuth } from '../../components/auth/AuthProvider';
import { InstructorShell } from '../../components/instructor/InstructorShell';
import { PageEntrance, StaggerCard, StaggerGrid } from '../../components/ui/MotionPrimitives';

function InstructorOverviewContent(): React.ReactElement {
  const { user } = useAuth();
  const initialStats = getCached<InstructorOverviewStats>(INSTRUCTOR_CACHE_KEYS.overview);
  const [stats, setStats] = useState<InstructorOverviewStats | null>(initialStats);
  const [isLoading, setIsLoading] = useState<boolean>(initialStats === null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async (force = false): Promise<void> => {
    if (!force && isCacheFresh(INSTRUCTOR_CACHE_KEYS.overview, 30_000) && stats) {
      setIsLoading(false);
      return;
    }
    if (!stats) setIsLoading(true);
    setError(null);
    try {
      const data = await fetchInstructorOverview({ force });
      setStats(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load instructor overview.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadStats(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageEntrance className="space-y-6">
      {/* Editorial Hero */}
      <section className="glass-panel-strong relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gradient-to-br from-white via-zinc-200/70 to-transparent blur-2xl"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="glass-pill">Welcome back</span>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
              {user?.name || 'Instructor'}&apos;s Teaching Studio
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-600">
              Monitor student writing submissions, approve enrollment requests, craft custom Lego
              exercises, and dispatch reports to your class Telegram groups.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadStats(true)}
              className="glass-btn-secondary !px-3 !py-2 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link href="/instructor/exercises" className="glass-btn-primary">
              <Plus className="h-4 w-4" />
              New Custom Exercise
            </Link>
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50/85 px-4 py-3 text-sm text-rose-800 backdrop-blur-md"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      {isLoading && !stats ? (
        <div className="glass-panel flex items-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">Loading studio metrics...</span>
        </div>
      ) : (
        <StaggerGrid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StaggerCard>
            <div className="glass-panel p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Approved Students
                </span>
                <Users className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="mt-3 text-3xl font-extrabold tabular-nums text-zinc-950">
                {stats?.approvedStudentsCount ?? 0}
              </div>
              <Link
                href="/instructor/students"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-950"
              >
                Manage roster
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </StaggerCard>

          <StaggerCard>
            <div className="glass-panel p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Pending Requests
                </span>
                <Clock className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tabular-nums text-zinc-950">
                  {stats?.pendingRequestsCount ?? 0}
                </span>
                {(stats?.pendingRequestsCount ?? 0) > 0 && (
                  <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    Needs review
                  </span>
                )}
              </div>
              <Link
                href="/instructor/students"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-950"
              >
                Review requests
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </StaggerCard>

          <StaggerCard>
            <div className="glass-panel p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  My Exercises
                </span>
                <Layers className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tabular-nums text-zinc-950">
                  {stats?.myExercisesCount ?? 0}
                </span>
                <span className="text-xs font-medium text-zinc-500">
                  ({stats?.publishedExercisesCount ?? 0} live)
                </span>
              </div>
              <Link
                href="/instructor/exercises"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-950"
              >
                Open exercises
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </StaggerCard>

          <StaggerCard>
            <div className="glass-panel p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Total Submissions
                </span>
                <FileText className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="mt-3 text-3xl font-extrabold tabular-nums text-zinc-950">
                {stats?.totalSubmissionsCount ?? 0}
              </div>
              <Link
                href="/instructor/submissions"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-950"
              >
                View all submissions
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </StaggerCard>
        </StaggerGrid>
      )}

      {/* Recent Submissions + Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="glass-panel-strong overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-zinc-900/[0.06] px-5 py-4">
            <div>
              <h2 className="text-base font-bold tracking-tight text-zinc-950">
                Recent Student Submissions
              </h2>
              <p className="text-xs text-zinc-500">Latest evaluated work from your students</p>
            </div>
            <Link
              href="/instructor/submissions"
              className="glass-btn-secondary !rounded-lg !px-3 !py-1.5 text-xs"
            >
              View All
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {!stats || stats.recentSubmissions.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileText className="mx-auto h-7 w-7 text-zinc-400" />
              <p className="mt-3 text-sm font-semibold text-zinc-800">No submissions yet</p>
              <p className="mt-1 text-xs text-zinc-500">
                When your approved students submit assessments, their scores and examiner reports
                will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-900/[0.05]">
              {stats.recentSubmissions.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-white/70"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-zinc-950">{item.studentName}</span>
                      <span className="glass-pill uppercase">{item.exerciseCode}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {item.studentClass || item.studentSchool || 'General'} ·{' '}
                      {new Date(item.createdAt).toLocaleDateString('en-GB')}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-extrabold tabular-nums text-zinc-950">
                      {item.marks.total} / {item.marks.total_max}
                    </span>
                    <Link
                      href={`/reports/${encodeURIComponent(item.id)}`}
                      className="glass-btn-secondary !rounded-lg !px-3 !py-1.5 text-xs"
                    >
                      View Report
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quick Actions */}
        <div className="space-y-3">
          <Link href="/instructor/exercises" className="glass-card block p-5">
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white">
                <Layers className="h-4 w-4" />
              </span>
              <ArrowRight className="h-4 w-4 text-zinc-400" />
            </div>
            <h3 className="mt-3 text-sm font-bold text-zinc-950">Build Custom Exercise</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">
              Design interactive tasks with drag-and-drop Lego blocks, custom prompts, and live
              preview.
            </p>
          </Link>

          <Link href="/instructor/students" className="glass-card block p-5">
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-zinc-900 ring-1 ring-zinc-900/10">
                <Users className="h-4 w-4" />
              </span>
              <ArrowRight className="h-4 w-4 text-zinc-400" />
            </div>
            <h3 className="mt-3 text-sm font-bold text-zinc-950">Approve Students</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">
              Review pending enrollment requests and inspect student &amp; parent Telegram contacts.
            </p>
          </Link>

          <Link href="/instructor/telegram" className="glass-card block p-5">
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-zinc-900 ring-1 ring-zinc-900/10">
                <Bot className="h-4 w-4" />
              </span>
              <ArrowRight className="h-4 w-4 text-zinc-400" />
            </div>
            <h3 className="mt-3 text-sm font-bold text-zinc-950">Class Telegram Groups</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">
              Connect your own class or school Telegram groups to receive automatic marked PDFs.
            </p>
          </Link>
        </div>
      </div>
    </PageEntrance>
  );
}

export default function InstructorOverviewPage(): React.ReactElement {
  return (
    <InstructorShell>
      <InstructorOverviewContent />
    </InstructorShell>
  );
}
