'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PersistedReport } from '@edumenai/shared';
import { ArrowRight, FileText, Loader2 } from 'lucide-react';
import { fetchReports } from '../../lib/api';
import { PageEntrance } from '../../components/ui/MotionPrimitives';

export default function ReportsArchivePage(): React.ReactElement {
  const [items, setItems] = useState<PersistedReport[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void fetchReports({ limit: 50, offset: 0 })
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
  }, []);

  return (
    <PageEntrance className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="glass-pill">Archive</div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Evaluation Reports
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base">
            View marked submissions, download official PDFs, and resend reports to Telegram.
          </p>
        </div>
        {!isLoading && (
          <span className="glass-pill !px-3.5 !py-1.5 !text-sm">
            {total} Total Report{total === 1 ? '' : 's'}
          </span>
        )}
      </div>

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
          <h2 className="mt-4 text-base font-semibold text-zinc-900">No reports yet</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Complete an exercise to generate your first AI examiner report.
          </p>
          <div className="mt-5">
            <Link href="/exercises" className="glass-btn-primary">
              Browse Exercises
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
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
                  <th className="px-5 py-3.5">Provider / Model</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/[0.05]">
                {items.map((item) => (
                  <tr key={item.id} className="transition-colors duration-200 hover:bg-white/70">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-zinc-900">{item.studentName}</div>
                      <div className="text-xs text-zinc-500">
                        {item.studentClass || item.studentSchool || 'General'}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="glass-pill uppercase">{item.exerciseCode}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-bold tabular-nums text-zinc-900">
                      {item.marks.total} / {item.marks.total_max}
                    </td>
                    <td className="px-5 py-4 text-xs text-zinc-600">
                      {item.provider} · {item.model}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-zinc-600">
                      {new Date(item.createdAt).toLocaleDateString('en-GB')}
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
        </div>
      )}
    </PageEntrance>
  );
}
