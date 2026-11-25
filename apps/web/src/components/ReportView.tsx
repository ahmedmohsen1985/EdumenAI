'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PersistedReport } from '@edumenai/shared';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  Loader2,
  Printer,
  Send
} from 'lucide-react';
import {
  fetchReportById,
  sendReportToTelegram,
  type TelegramDispatchResult
} from '../lib/api';
import { generateReportPdf } from '../lib/pdf';
import { useAuth } from './auth/AuthProvider';
import { HighlightedText } from './HighlightedText';
import { PageEntrance, SPRING_GENTLE, SPRING_SNAPPY } from './ui/MotionPrimitives';

interface ReportViewProps {
  reportId: string;
}

function buildDispatchStatus(
  result: TelegramDispatchResult,
  automatic: boolean
): { ok: boolean; message: string } {
  const deliveredTargets = result.targets.filter((t) => t.ok).length;
  const totalTargets = result.targets.length;
  const studentOk = Boolean(result.student?.ok);
  const parentOk = Boolean(result.parent?.ok);

  const recipients: string[] = [];
  if (totalTargets > 0) {
    recipients.push(`${deliveredTargets}/${totalTargets} teacher/class group(s)`);
  }
  if (studentOk) recipients.push('student');
  if (parentOk) recipients.push('parent');

  const anyDelivered = deliveredTargets > 0 || studentOk || parentOk;
  if (!anyDelivered) {
    if (totalTargets > 0 || result.student || result.parent) {
      return {
        ok: false,
        message:
          result.targets[0]?.error ||
          result.student?.error ||
          result.parent?.error ||
          result.parent?.description ||
          'Telegram PDF delivery did not succeed for any configured recipients.'
      };
    }
    return {
      ok: true,
      message: automatic
        ? 'Report saved. No Telegram recipients were configured for automatic PDF delivery.'
        : 'No Telegram recipients are configured for this report.'
    };
  }

  const prefix = automatic ? 'PDF report automatically dispatched to' : 'PDF report dispatched to';
  return {
    ok: true,
    message: `${prefix} ${recipients.join(', ')}.`
  };
}

export function ReportView({ reportId }: ReportViewProps): React.ReactElement {
  const { user } = useAuth();
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

  // Automatic PDF dispatch when arriving from ExerciseRunner (?autoDispatch=1)
  useEffect(() => {
    if (!report || report.isPreview || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoDispatch') !== '1') return;

    const storageKey = `edumenai_pdf_dispatched_${report.id}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, '1');
    } catch {
      // Proceed even if sessionStorage is unavailable
    }

    let cancelled = false;
    setIsSendingTelegram(true);
    setTelegramStatus(null);

    const runAutoDispatch = async (): Promise<void> => {
      try {
        const { blob, fileName } = generateReportPdf(report);
        const result = await sendReportToTelegram(report.id, {
          pdfBlob: blob,
          fileName
        });
        if (!cancelled) {
          setTelegramStatus(buildDispatchStatus(result, true));
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setTelegramStatus({
            ok: false,
            message:
              err instanceof Error
                ? `Automatic Telegram PDF dispatch failed: ${err.message}`
                : 'Automatic Telegram PDF dispatch failed.'
          });
        }
      } finally {
        if (!cancelled) {
          setIsSendingTelegram(false);
        }
      }
    };

    void runAutoDispatch();
    return () => {
      cancelled = true;
    };
  }, [report]);

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
      setTelegramStatus(buildDispatchStatus(result, false));
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
        <div className="glass-panel-strong flex items-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">Loading evaluation report...</span>
        </div>
      </div>
    );
  }

  if (loadError || !report) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 p-6 text-rose-900 shadow-glass backdrop-blur-xl">
          <h2 className="text-base font-bold">Report not found</h2>
          <p className="mt-1 text-sm">{loadError || 'Unable to locate this report.'}</p>
          <Link href="/reports" className="glass-btn-secondary mt-4">
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
    <PageEntrance className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
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
            className="glass-btn-secondary !rounded-full !px-3.5 !py-1.5 text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All Reports
          </Link>
          {report.isPreview && (
            <Link
              href={
                user?.role === 'INSTRUCTOR'
                  ? `/instructor/exercises/${encodeURIComponent(report.exerciseCode)}/builder`
                  : `/admin/exercises/${encodeURIComponent(report.exerciseCode)}/builder`
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/80 bg-amber-50/85 px-3.5 py-1.5 text-xs font-semibold text-amber-900 backdrop-blur-md transition-colors duration-200 hover:bg-amber-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Builder
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleDownloadPdf} className="glass-btn-primary">
            <Download className="h-4 w-4" />
            Download PDF Report
          </button>

          <button type="button" onClick={handlePrint} className="glass-btn-secondary">
            <Printer className="h-4 w-4" />
            Print
          </button>

          <button
            type="button"
            onClick={() => void handleSendTelegram()}
            disabled={isSendingTelegram}
            className="glass-btn-secondary"
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
      {isSendingTelegram && !telegramStatus && (
        <div
          role="status"
          className="glass-panel flex items-center gap-2.5 px-4 py-3 text-sm text-zinc-700 print:hidden"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-600" />
          <span>Dispatching PDF report to Telegram recipients (teacher group, student &amp; parent)...</span>
        </div>
      )}
      {telegramStatus && (
        <div
          role="status"
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm backdrop-blur-xl print:hidden ${
            telegramStatus.ok
              ? 'border-emerald-200/80 bg-emerald-50/85 text-emerald-800'
              : 'border-rose-200/80 bg-rose-50/85 text-rose-800'
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
      <div className="glass-panel-strong p-5 sm:p-6 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                {report.exerciseCode}
              </span>
              <span className="text-xs font-medium text-zinc-500">
                Version {report.promptVersion} · {formattedDate}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-zinc-950">
              {report.studentName}
            </h1>
            <p className="text-sm text-zinc-600">
              {report.studentClass || report.studentSchool || 'General'}
            </p>
          </div>
          {report.isPreview && (
            <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-300/80 bg-amber-100/80 px-3 py-1 text-xs font-semibold text-amber-900">
              Preview Draft Run
            </span>
          )}
        </div>
      </div>

      {/* Marks Overview (3 Cards) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-700/60 bg-gradient-to-br from-zinc-800/95 to-zinc-950/95 p-5 text-white shadow-glass-lg ring-1 ring-zinc-900/10 backdrop-blur-xl">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Total Mark
          </div>
          <div className="mt-2 text-4xl font-extrabold tabular-nums">
            {report.marks.total}{' '}
            <span className="text-lg font-medium text-zinc-400">/ {report.marks.total_max}</span>
          </div>
        </div>

        <div className="glass-panel p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Content &amp; Communication
          </div>
          <div className="mt-2 text-4xl font-extrabold tabular-nums text-zinc-900">
            {report.marks.content}{' '}
            <span className="text-lg font-medium text-zinc-400">/ {report.marks.content_max}</span>
          </div>
        </div>

        <div className="glass-panel p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">Language</div>
          <div className="mt-2 text-4xl font-extrabold tabular-nums text-zinc-900">
            {report.marks.language}{' '}
            <span className="text-lg font-medium text-zinc-400">
              / {report.marks.language_max}
            </span>
          </div>
        </div>
      </div>

      {/* Examiner Verdict */}
      <section className="glass-panel p-6">
        <h2 className="border-b border-zinc-900/[0.06] pb-3 text-base font-bold text-zinc-950">
          Examiner Verdict
        </h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-700">
          <div>
            <span className="font-semibold text-zinc-950">Content: </span>
            {report.justification.content}
          </div>
          <div>
            <span className="font-semibold text-zinc-950">Language: </span>
            {report.justification.language}
          </div>
        </div>
      </section>

      {/* Errors Detected */}
      <section className="glass-panel p-6">
        <h2 className="border-b border-zinc-900/[0.06] pb-3 text-base font-bold text-zinc-950">
          Errors Detected ({report.errors.length})
        </h2>
        {report.errors.length === 0 ? (
          <div className="mt-4 rounded-xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-800">
            No significant errors flagged. Excellent control!
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-900/[0.08] text-xs font-bold uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5 pr-4">Original</th>
                  <th className="py-2.5 pr-4">Correction</th>
                  <th className="py-2.5 pr-4">Type</th>
                  <th className="py-2.5">Explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/[0.05]">
                {report.errors.map((errItem, idx) => (
                  <tr key={idx} className="align-top transition-colors duration-200 hover:bg-white/60">
                    <td className="py-3 pr-4 font-medium text-rose-700">{errItem.original}</td>
                    <td className="py-3 pr-4 font-semibold text-emerald-700">
                      {errItem.correction}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="glass-pill">{errItem.category}</span>
                    </td>
                    <td className="py-3 text-zinc-700">{errItem.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Content Feedback */}
      <section className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-6 shadow-glass backdrop-blur-xl">
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
      <section className="glass-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900/[0.06] pb-3">
          <h2 className="text-base font-bold text-zinc-950">Corrected Version (Improved)</h2>
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <mark className="correction px-1.5 py-0.5 font-medium">Sample</mark>
            <span>Highlighted Correction</span>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-zinc-900/[0.06] bg-white/70 p-4 shadow-[inset_0_1px_2px_rgba(15,17,21,0.04)]">
          <HighlightedText html={report.correctedVersion} />
        </div>
      </section>

      {/* Collapsible Audit Accordion */}
      <section className="glass-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAuditText((prev) => !prev)}
          aria-expanded={showAuditText}
          aria-controls="report-audit-panel"
          className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-semibold text-zinc-950 transition-colors duration-200 hover:bg-white/60"
        >
          <span>Task Prompt &amp; Submitted Text</span>
          <motion.span
            animate={{ rotate: showAuditText ? 180 : 0 }}
            transition={SPRING_SNAPPY}
            className="flex"
          >
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {showAuditText && (
            <motion.div
              id="report-audit-panel"
              key="audit-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING_GENTLE}
              className="overflow-hidden"
            >
              <div className="space-y-4 border-t border-zinc-900/[0.06] px-6 py-4 text-sm">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Task Prompt
                  </h3>
                  <p className="mt-1.5 whitespace-pre-wrap rounded-xl bg-white/70 p-3 text-zinc-700 ring-1 ring-zinc-900/[0.05]">
                    {report.taskPrompt}
                  </p>
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Submitted Text
                  </h3>
                  <p className="mt-1.5 whitespace-pre-wrap rounded-xl bg-white/70 p-3 text-zinc-700 ring-1 ring-zinc-900/[0.05]">
                    {report.finalText}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* AI Metadata Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-zinc-400">
        <span>
          AI Provider: {report.provider} ({report.model})
        </span>
        <span>
          Tokens: {report.totalTokens ?? '—'} (in: {report.promptTokens ?? '—'}, out:{' '}
          {report.completionTokens ?? '—'}) · Latency:{' '}
          {report.latencyMs !== null ? `${report.latencyMs}ms` : '—'}
        </span>
      </div>
    </PageEntrance>
  );
}
