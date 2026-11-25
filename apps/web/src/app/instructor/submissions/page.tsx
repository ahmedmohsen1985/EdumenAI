'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { PersistedReport } from '@edumenai/shared';
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Search
} from 'lucide-react';
import {
  fetchInstructorExercises,
  fetchInstructorSubmissions
} from '../../../lib/instructor-api';
import { InstructorShell } from '../../../components/instructor/InstructorShell';
import { PageEntrance } from '../../../components/ui/MotionPrimitives';

const PAGE_SIZE = 25;

interface ExerciseOption {
  code: string;
  title: string;
}

function InstructorSubmissionsContent(): React.ReactElement {
  const [items, setItems] = useState<PersistedReport[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0);
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [exerciseCode, setExerciseCode] = useState<string>('');
  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setOffset(0);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    void fetchInstructorExercises()
      .then((res) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const ex of res.myExercises) map.set(ex.code, ex.title);
        for (const ex of res.platformExercises) {
          if (!map.has(ex.code)) map.set(ex.code, ex.title);
        }
        setExerciseOptions(
          Array.from(map.entries()).map(([code, title]) => ({ code, title }))
        );
      })
      .catch(() => {
        // Non-blocking filter enhancement
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSubmissions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchInstructorSubmissions({
        search: debouncedSearch || undefined,
        exerciseCode: exerciseCode || undefined,
        limit: PAGE_SIZE,
        offset
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load student submissions.');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, exerciseCode, offset]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <PageEntrance className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="glass-pill">Student Work</span>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
            Student Submissions
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Search and review AI-marked reports submitted to you or on your custom exercises.
          </p>
        </div>
        {!isLoading && (
          <span className="glass-pill !px-3.5 !py-1.5 !text-sm">
            {total} Submission{total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="glass-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by student name, class, or school..."
            aria-label="Search student submissions"
            className="glass-input !pl-10"
          />
        </div>

        <div className="sm:w-64">
          <select
            aria-label="Filter by exercise"
            value={exerciseCode}
            onChange={(e) => {
              setExerciseCode(e.target.value);
              setOffset(0);
            }}
            className="glass-input"
          >
            <option value="">All Exercises</option>
            {exerciseOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.title} ({opt.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50/85 px-4 py-3 text-sm text-rose-800 backdrop-blur-md"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="glass-panel-strong flex items-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">Loading student submissions...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="glass-panel border-dashed px-6 py-14 text-center">
          <FileText className="mx-auto h-8 w-8 text-zinc-400" />
          <h2 className="mt-3 text-base font-bold text-zinc-900">No matching submissions</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {debouncedSearch || exerciseCode
              ? 'Try clearing your search or exercise filter.'
              : 'Submissions from your enrolled students will appear here automatically.'}
          </p>
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
                  <th className="px-5 py-3.5">Breakdown</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/[0.05]">
                {items.map((item) => (
                  <tr key={item.id} className="transition-colors duration-200 hover:bg-white/70">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-zinc-950">{item.studentName}</div>
                      <div className="text-xs text-zinc-500">
                        {[item.studentClass, item.studentSchool].filter(Boolean).join(' · ') ||
                          'General'}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="glass-pill uppercase">{item.exerciseCode}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-extrabold tabular-nums text-zinc-950">
                      {item.marks.total} / {item.marks.total_max}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs tabular-nums text-zinc-600">
                      C: {item.marks.content}/{item.marks.content_max} · L: {item.marks.language}/
                      {item.marks.language_max}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-zinc-600">
                      {new Date(item.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/reports/${encodeURIComponent(item.id)}`}
                        className="glass-btn-secondary !rounded-lg !px-3 !py-1.5 text-xs"
                      >
                        View Report
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-zinc-900/[0.06] bg-white/40 px-5 py-3 text-xs text-zinc-600">
              <span>
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!hasPrev}
                  onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                  className="glass-btn-secondary !rounded-lg !px-3 !py-1.5 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={!hasNext}
                  onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                  className="glass-btn-secondary !rounded-lg !px-3 !py-1.5 text-xs"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </PageEntrance>
  );
}

export default function InstructorSubmissionsPage(): React.ReactElement {
  return (
    <InstructorShell>
      <InstructorSubmissionsContent />
    </InstructorShell>
  );
}
