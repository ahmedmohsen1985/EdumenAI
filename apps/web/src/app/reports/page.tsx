'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PersistedReport } from '@edumenai/shared';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  LogIn,
  Search,
  Trash2,
  UserPlus
} from 'lucide-react';
import { deleteReport, fetchReports } from '../../lib/api';
import { useAuth } from '../../components/auth/AuthProvider';
import { PageEntrance } from '../../components/ui/MotionPrimitives';

export default function ReportsArchivePage(): React.ReactElement {
  const { user, isLoading: authLoading } = useAuth();
  const [items, setItems] = useState<PersistedReport[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isStaff = user?.role === 'INSTRUCTOR' || user?.role === 'ADMIN';

  const canDeleteItem = (item: PersistedReport): boolean =>
    Boolean(
      user?.role === 'ADMIN' ||
        (user?.role === 'INSTRUCTOR' &&
          Boolean(item.exerciseOwnerId) &&
          item.exerciseOwnerId === user.id)
    );

  const handleDeleteReport = async (id: string): Promise<void> => {
    setDeletingId(id);
    setError(null);
    try {
      await deleteReport(id);
      setConfirmDeleteId(null);
      setItems((prev) => prev.filter((r) => r.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete report.');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (authLoading || !user) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void fetchReports({
      limit: 50,
      offset: 0,
      ...(isStaff && debouncedSearch ? { search: debouncedSearch } : {})
    })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load reports.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, debouncedSearch, isStaff, user]);

  if (authLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="glass-panel-strong flex items-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">Verifying your account...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <PageEntrance className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="glass-panel-strong relative overflow-hidden p-8 text-center sm:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-white via-zinc-200/70 to-transparent blur-2xl"
          />
          <div className="relative">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-glass-lg">
              <Lock className="h-6 w-6" />
            </div>
            <div className="mt-4 flex justify-center">
              <span className="glass-pill">Private Reports</span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-zinc-950">
              Sign In to View Your Reports
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-600">
              Evaluation reports are private to each student, their assigned instructor, and
              platform administrators.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/login?next=/reports" className="glass-btn-primary">
                <LogIn className="h-4 w-4" />
                Sign In
              </Link>
              <Link href="/register?next=/reports" className="glass-btn-secondary">
                <UserPlus className="h-4 w-4" />
                Create Account
              </Link>
            </div>
          </div>
        </div>
      </PageEntrance>
    );
  }

  return (
    <PageEntrance className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="glass-pill">{user.role === 'STUDENT' ? 'Student Archive' : 'Archive'}</div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            {user.role === 'STUDENT' ? 'My Submissions' : 'Evaluation Reports'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base">
            {user.role === 'STUDENT'
              ? 'Review your marked assessments, download official PDFs, and share reports to Telegram.'
              : 'View marked submissions, search by student or class, download official PDFs, and dispatch reports to Telegram.'}
          </p>
        </div>
        {!isLoading && (
          <span className="glass-pill !px-3.5 !py-1.5 !text-sm">
            {total} Total Report{total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Staff Search Input */}
      {isStaff && (
        <div className="glass-panel p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search reports by student name, school, class, or exercise..."
              aria-label="Search evaluation reports"
              className="glass-input !pl-10"
            />
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 backdrop-blur-md"
        >
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="glass-panel-strong flex items-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">Loading reports...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="glass-panel border-dashed px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-zinc-500 shadow-glass ring-1 ring-zinc-900/[0.06]">
            <FileText className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-zinc-900">
            {debouncedSearch ? 'No matching reports' : 'No reports yet'}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {debouncedSearch
              ? 'Try a different student name or clear the search bar.'
              : 'Complete an exercise to generate your first AI examiner report.'}
          </p>
          {!debouncedSearch && (
            <div className="mt-5">
              <Link href="/exercises" className="glass-btn-primary">
                Browse Exercises
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-panel-strong overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-900/[0.06] bg-white/50 text-xs font-bold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-5 py-3.5">Exercise</th>
                  <th className="px-5 py-3.5">Score</th>
                  {isStaff && <th className="px-5 py-3.5">Integrity</th>}
                  <th className="px-5 py-3.5">Provider / Model</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/[0.05]">
                {items.map((item) => {
                  const log = isStaff ? item.integrityLog : null;
                  const flagCount = log
                    ? log.totalViolations ||
                      log.tabSwitchCount +
                        log.windowBlurCount +
                        log.pasteBlockedCount +
                        log.copyBlockedCount +
                        log.rightClickBlockedCount
                    : 0;
                  const allowDelete = canDeleteItem(item);
                  const isConfirming = confirmDeleteId === item.id;
                  const isDeleting = deletingId === item.id;

                  return (
                    <tr key={item.id} className="transition-colors duration-200 hover:bg-white/70">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-zinc-900">{item.studentName}</div>
                        <div className="text-xs text-zinc-500">
                          {item.studentClass || item.studentSchool || 'General'}
                          {item.instructorName ? ` · Instructor: ${item.instructorName}` : ''}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="glass-pill uppercase">{item.exerciseCode}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-bold tabular-nums text-zinc-900">
                        {item.marks.total} / {item.marks.total_max}
                      </td>
                      {isStaff && (
                        <td className="whitespace-nowrap px-5 py-4">
                          {log ? (
                            flagCount === 0 ? (
                              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50/85 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                Clean
                              </span>
                            ) : (
                              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-amber-300/80 bg-amber-50/90 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                                <AlertTriangle className="h-3 w-3" />
                                {flagCount} {flagCount === 1 ? 'flag' : 'flags'}
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-5 py-4 text-xs text-zinc-600">
                        {item.provider} · {item.model}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-zinc-600">
                        {new Date(item.createdAt).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Link
                            href={`/reports/${encodeURIComponent(item.id)}`}
                            className="glass-btn-secondary !rounded-lg !px-3 !py-1.5 text-xs"
                          >
                            View Report
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>

                          {allowDelete &&
                            (isConfirming ? (
                              <div className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/90 px-2 py-1 text-xs">
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => void handleDeleteReport(item.id)}
                                  className="rounded bg-rose-600 px-2 py-0.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                                >
                                  {isDeleting ? '...' : 'Confirm'}
                                </button>
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="rounded bg-white px-2 py-0.5 font-semibold text-zinc-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(item.id)}
                                title="Delete report"
                                aria-label={`Delete report for ${item.studentName}`}
                                className="glass-btn-secondary !rounded-lg !p-2 text-rose-700 hover:!border-rose-200 hover:!bg-rose-50/90"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageEntrance>
  );
}
