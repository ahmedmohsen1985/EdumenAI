'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PersistedReport } from '@edumenai/shared';
import { ArrowRight, FileText, Loader2 } from 'lucide-react';
import { fetchReports } from '../../lib/api';

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
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Evaluation Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            View marked submissions, download official PDFs, and resend reports to Telegram.
          </p>
        </div>
        {!isLoading && (
          <span className="rounded-full bg-brand-cream px-3 py-1 text-xs font-semibold text-brand-navy border border-brand-gold/40">
            {total} Total Report{total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-brand-navy" />
          <span className="text-sm font-medium text-slate-700">Loading reports...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-cream text-brand-gold">
            <FileText className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-brand-navy">No reports yet</h2>
          <p className="mt-1 text-sm text-slate-600">
            Complete an exercise to generate your first AI examiner report.
          </p>
          <div className="mt-5">
            <Link
              href="/exercises"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90"
            >
              Browse Exercises
              <ArrowRight className="h-4 w-4 text-brand-gold" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Student</th>
                  <th className="px-5 py-3">Exercise</th>
                  <th className="px-5 py-3">Score</th>
                  <th className="px-5 py-3">Provider / Model</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-brand-navy">{item.studentName}</div>
                      <div className="text-xs text-slate-500">
                        {item.studentClass || item.studentSchool || 'General'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-md bg-brand-cream px-2 py-0.5 text-xs font-bold uppercase text-brand-navy border border-brand-gold/30">
                        {item.exerciseCode}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-brand-navy">
                      {item.marks.total} / {item.marks.total_max}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {item.provider} · {item.model}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {new Date(item.createdAt).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/reports/${encodeURIComponent(item.id)}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-brand-navy hover:border-brand-gold hover:bg-brand-cream"
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
    </div>
  );
}
