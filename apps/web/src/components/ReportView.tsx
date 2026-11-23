'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PersistedReport } from '@edumenai/shared';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Printer,
  Send
} from 'lucide-react';
import { fetchReportById, sendReportToTelegram } from '../lib/api';
import { generateReportPdf } from '../lib/pdf';
import { HighlightedText } from './HighlightedText';

interface ReportViewProps {
  reportId: string;
}

export function ReportView({ reportId }: ReportViewProps): React.ReactElement {
  const [report, setReport] = useState<PersistedReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSendingTelegram, setIsSendingTelegram] = useState<boolean>(false);
  const [telegramStatus, setTelegramStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [showAuditText, setShowAuditText] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    void fetchReportById(reportId)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load report.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const handleDownloadPdf = (): void => {
    if (!report) return;
    const { doc, fileName } = generateReportPdf(report);
    doc.save(fileName);
  };

  const handlePrint = (): void => {
    window.print();
  };

  const handleSendTelegram = async (): Promise<void> => {
    if (!report) return;
    setIsSendingTelegram(true);
    setTelegramStatus(null);
    try {
      const { blob, fileName } = generateReportPdf(report);
      const result = await sendReportToTelegram(report.id, {
        pdfBlob: blob,
        fileName
      });

      const deliveredTargets = result.targets.filter((t) => t.ok).length;
      const totalTargets = result.targets.length;
      const studentOk = result.student?.ok;

      if (deliveredTargets === 0 && !studentOk && totalTargets > 0) {
        setTelegramStatus({
          ok: false,
          message:
            result.targets[0]?.error ||
            'Telegram delivery did not succeed for any configured targets.'
        });
      } else {
        setTelegramStatus({
          ok: true,
          message: `Report dispatched to ${deliveredTargets}/${totalTargets} Telegram target(s)${
            studentOk ? ' and student' : ''
          }.`
        });
      }
    } catch (err: unknown) {
      setTelegramStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to send report to Telegram.'
      });
    } finally {
      setIsSendingTelegram(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-brand-navy" />
          <span className="text-sm font-medium text-slate-700">Loading evaluation report...</span>
        </div>
      </div>
    );
  }

  if (loadError || !report) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="text-base font-bold">Report not found</h2>
          <p className="mt-1 text-sm">{loadError || 'Unable to locate this report.'}</p>
          <Link
            href="/reports"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-navy underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Reports
          </Link>
        </div>
      </div>
    );
  }

  const formattedDate = new Date(report.createdAt).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6">
      {/* Print-Only Header */}
      <div className="hidden print:block border-b-2 border-brand-gold pb-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-brand-navy">
              EdumenAI — Official AI Examiner Report
            </h1>
            <p className="text-xs text-slate-600">
              Exercise: {report.exerciseCode.toUpperCase()} (v{report.promptVersion})
            </p>
          </div>
          <div className="text-right text-xs text-slate-700">
            <div>
              <strong>Student:</strong> {report.studentName}
            </div>
            <div>
              <strong>Class:</strong> {report.studentClass || report.studentSchool || 'General'}
            </div>
            <div>
              <strong>Date:</strong> {formattedDate}
            </div>
          </div>
        </div>
      </div>

      {/* Top Navigation & Action Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/reports"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand-navy"
          >
            <ArrowLeft className="h-4 w-4" />
            All Reports
          </Link>
          {report.isPreview && (
            <Link
              href={`/admin/exercises/${encodeURIComponent(report.exerciseCode)}/builder`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Builder
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-navy/90"
          >
            <Download className="h-4 w-4 text-brand-gold" />
            Download PDF Report
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>

          <button
            type="button"
            onClick={() => void handleSendTelegram()}
            disabled={isSendingTelegram}
            className="inline-flex items-center gap-2 rounded-xl border border-brand-gold bg-brand-cream px-4 py-2 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-gold/20 disabled:opacity-60"
          >
            {isSendingTelegram ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send to Telegram Bot
          </button>
        </div>
      </div>

      {/* Telegram Status Banner */}
      {telegramStatus && (
        <div
          role="status"
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm print:hidden ${
            telegramStatus.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {telegramStatus.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{telegramStatus.message}</span>
        </div>
      )}

      {/* Student Metadata Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-brand-navy px-2.5 py-0.5 text-xs font-bold uppercase text-brand-gold">
                {report.exerciseCode}
              </span>
              <span className="text-xs font-medium text-slate-500">
                Version {report.promptVersion} · {formattedDate}
              </span>
            </div>
            <h1 className="mt-2 text-xl font-bold text-brand-navy">{report.studentName}</h1>
            <p className="text-sm text-slate-600">
              {report.studentClass || report.studentSchool || 'General'}
            </p>
          </div>
          {report.isPreview && (
            <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
              Preview Draft Run
            </span>
          )}
        </div>
      </div>

      {/* Marks Overview (3 Cards) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-brand-navy p-5 text-white shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-brand-gold">
            Total Mark
          </div>
          <div className="mt-2 text-3xl font-extrabold">
            {report.marks.total}{' '}
            <span className="text-lg font-medium text-slate-300">/ {report.marks.total_max}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-brand-gold/40 bg-brand-cream p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Content &amp; Communication
          </div>
          <div className="mt-2 text-3xl font-extrabold text-brand-navy">
            {report.marks.content}{' '}
            <span className="text-lg font-medium text-slate-500">/ {report.marks.content_max}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-brand-gold/40 bg-brand-cream p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-600">Language</div>
          <div className="mt-2 text-3xl font-extrabold text-brand-navy">
            {report.marks.language}{' '}
            <span className="text-lg font-medium text-slate-500">
              / {report.marks.language_max}
            </span>
          </div>
        </div>
      </div>

      {/* Examiner Verdict */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-brand-navy border-b border-slate-100 pb-3">
          Examiner Verdict
        </h2>
        <div className="mt-4 space-y-3 text-sm text-slate-700">
          <div>
            <span className="font-semibold text-brand-navy">Content: </span>
            {report.justification.content}
          </div>
          <div>
            <span className="font-semibold text-brand-navy">Language: </span>
            {report.justification.language}
          </div>
        </div>
      </section>

      {/* Errors Detected */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-brand-navy border-b border-slate-100 pb-3">
          Errors Detected ({report.errors.length})
        </h2>
        {report.errors.length === 0 ? (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            No significant errors flagged. Excellent control!
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 pr-4">Original</th>
                  <th className="py-2.5 pr-4">Correction</th>
                  <th className="py-2.5 pr-4">Type</th>
                  <th className="py-2.5">Explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.errors.map((errItem, idx) => (
                  <tr key={idx} className="align-top">
                    <td className="py-3 pr-4 font-medium text-red-700">{errItem.original}</td>
                    <td className="py-3 pr-4 font-semibold text-emerald-700">
                      {errItem.correction}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {errItem.category}
                      </span>
                    </td>
                    <td className="py-3 text-slate-700">{errItem.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Content Feedback */}
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
        <h2 className="text-base font-bold text-emerald-900">Content &amp; Expansion Feedback</h2>
        <ul className="mt-3 space-y-2 text-sm text-emerald-950">
          {report.contentFeedback.map((point, idx) => (
            <li key={idx} className="flex items-start gap-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Corrected Version */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-brand-navy">Corrected Version (Improved)</h2>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <mark className="correction px-1.5 py-0.5 font-medium">Sample</mark>
            <span>Highlighted Correction</span>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <HighlightedText html={report.correctedVersion} />
        </div>
      </section>

      {/* Collapsible Audit Accordion */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowAuditText((prev) => !prev)}
          className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-semibold text-brand-navy"
        >
          <span>Task Prompt &amp; Submitted Text</span>
          {showAuditText ? (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </button>

        {showAuditText && (
          <div className="space-y-4 border-t border-slate-100 px-6 py-4 text-sm">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Task Prompt
              </h3>
              <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-slate-700">
                {report.taskPrompt}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Submitted Text
              </h3>
              <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-slate-700">
                {report.finalText}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* AI Metadata Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-400">
        <span>
          AI Provider: {report.provider} ({report.model})
        </span>
        <span>
          Tokens: {report.totalTokens ?? '—'} (in: {report.promptTokens ?? '—'}, out:{' '}
          {report.completionTokens ?? '—'}) · Latency:{' '}
          {report.latencyMs !== null ? `${report.latencyMs}ms` : '—'}
        </span>
      </div>
    </div>
  );
}
