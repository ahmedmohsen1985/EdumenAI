'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  TemplateRenderer,
  type BlockActionHandler,
  type BlockFieldErrors,
  type BlockFormValues,
  type BlockOcrHandler,
  type BlockRuntimeContext,
  type PublicPromptMeta
} from '@edumenai/blocks';
import type {
  EvaluatePersistedResponse,
  PromptEntry,
  TemplateBlock,
  TemplateConfig,
  TranscriptionMeta
} from '@edumenai/shared';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  RotateCcw
} from 'lucide-react';
import { getStoredAdminKey } from '../../../lib/admin-auth';
import { ApiError, runExerciseEvaluate, runExerciseOcr } from '../../../lib/api';

interface LivePreviewPaneProps {
  code: string;
  exerciseTitle: string;
  totalMarks: number;
  versionId: string;
  versionNumber: number;
  templateSchema: TemplateConfig;
  promptEntries: PromptEntry[];
}

function getStringField(values: BlockFormValues, keys: string[]): string {
  for (const key of keys) {
    const val = values[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return '';
}

function isTranscriptionMeta(value: unknown): value is TranscriptionMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return typeof (value as Record<string, unknown>).pages_detected === 'number';
}

export function LivePreviewPane({
  code,
  exerciseTitle,
  totalMarks,
  versionId,
  versionNumber,
  templateSchema,
  promptEntries
}: LivePreviewPaneProps): React.ReactElement {
  const [values, setValues] = useState<BlockFormValues>({});
  const [rawOcrTexts, setRawOcrTexts] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<BlockFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<{
    message: string;
    isQuota?: boolean;
  } | null>(null);
  const [previewResult, setPreviewResult] = useState<EvaluatePersistedResponse['data'] | null>(
    null
  );

  const setValue = useCallback((fieldKey: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldKey]: value }));
    if (typeof value === 'string' && value === '') {
      setRawOcrTexts((prev) => {
        if (!(fieldKey in prev)) return prev;
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
    }
    setErrors((prev) => {
      if (!prev[fieldKey]) return prev;
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  }, []);

  const setFieldMeta = useCallback((fieldKey: string, fieldMeta: unknown) => {
    setMeta((prev) => ({ ...prev, [fieldKey]: fieldMeta }));
  }, []);

  const handleResetPreview = (): void => {
    setValues({});
    setRawOcrTexts({});
    setMeta({});
    setErrors({});
    setPreviewError(null);
    setPreviewResult(null);
  };

  const onRunOcr: BlockOcrHandler = useCallback(
    async ({ file, promptKey, fieldKey }) => {
      setPreviewError(null);
      const res = await runExerciseOcr(code, {
        file,
        promptKey,
        versionId,
        isPreview: true,
        adminKey: getStoredAdminKey()
      });
      setValue(fieldKey, res.text);
      setRawOcrTexts((prev) => ({ ...prev, [fieldKey]: res.text }));
      if (res.transcriptionMeta) {
        setFieldMeta(fieldKey, res.transcriptionMeta);
      }
      return {
        text: res.text,
        ...(res.transcriptionMeta ? { transcriptionMeta: res.transcriptionMeta } : {}),
        provider: res.provider,
        model: res.model
      };
    },
    [code, setFieldMeta, setValue, versionId]
  );

  const onTriggerAction: BlockActionHandler = useCallback(
    async ({ block }) => {
      setPreviewError(null);

      const nextErrors: BlockFieldErrors = {};
      for (const b of templateSchema.blocks) {
        if (b.required && b.fieldKey) {
          const val = values[b.fieldKey];
          const strVal = typeof val === 'string' ? val.trim() : '';
          if (!strVal) {
            nextErrors[b.fieldKey] = `${b.label || b.fieldKey} is required.`;
          }
        }
      }

      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
        setPreviewError({
          message: 'Please complete all required fields before running preview evaluation.'
        });
        return;
      }

      const targetId = block.bindings?.targetActionBlockId;
      const evalBlock: TemplateBlock | undefined =
        (targetId
          ? templateSchema.blocks.find((b) => b.id === targetId)
          : undefined) ??
        templateSchema.blocks.find((b) => b.type === 'examiner_evaluation');

      const fieldMap = evalBlock?.bindings?.inputFieldMap ?? {};

      const studentName = getStringField(values, [
        fieldMap.studentName ?? '',
        'student_name',
        'name'
      ]);
      const studentClass = getStringField(values, [
        fieldMap.studentClass ?? '',
        'student_class',
        'class_name',
        'className'
      ]);
      const studentSchool = getStringField(values, [
        fieldMap.studentSchool ?? '',
        'student_school',
        'school'
      ]);
      const studentTelegram = getStringField(values, [
        fieldMap.studentTelegram ?? '',
        'student_telegram',
        'telegram'
      ]);

      const taskPrompt = getStringField(values, [
        fieldMap.taskPrompt ?? '',
        'task_question',
        'task_prompt',
        'prompt'
      ]);

      const studentTextKey =
        fieldMap.studentText ||
        (['student_article', 'student_response', 'final_text'].find(
          (k) => typeof values[k] === 'string'
        ) ??
          '');
      const studentText = getStringField(values, [
        studentTextKey,
        'student_article',
        'student_response',
        'final_text'
      ]);

      if (!taskPrompt || !studentText) {
        setPreviewError({
          message:
            'Both a task prompt and student response field are required for AI evaluation. Check your inputFieldMap bindings.'
        });
        return;
      }

      const rawMetaCandidate = studentTextKey
        ? meta[studentTextKey]
        : Object.values(meta).find(isTranscriptionMeta);
      const transcriptionMeta = isTranscriptionMeta(rawMetaCandidate)
        ? rawMetaCandidate
        : undefined;

      setIsSubmitting(true);
      try {
        const result = await runExerciseEvaluate(
          code,
          {
            student: {
              name: studentName || 'Preview Student',
              ...(studentClass ? { className: studentClass } : {}),
              ...(studentSchool ? { school: studentSchool } : {}),
              ...(studentTelegram ? { telegram: studentTelegram } : {})
            },
            taskPrompt,
            rawText: (studentTextKey ? rawOcrTexts[studentTextKey] : undefined) || studentText,
            finalText: studentText,
            ...(transcriptionMeta ? { transcriptionMeta } : {}),
            versionId,
            isPreview: true,
            formData: values,
            ...(evalBlock?.bindings?.promptKeys
              ? { promptKeys: evalBlock.bindings.promptKeys }
              : {}),
            ...(evalBlock?.bindings?.telegramTargetIds
              ? { telegramTargetIds: evalBlock.bindings.telegramTargetIds }
              : {})
          },
          { adminKey: getStoredAdminKey() }
        );

        setPreviewResult(result);
      } catch (err: unknown) {
        const isQuota =
          err instanceof ApiError && Boolean(err.isQuotaError || err.status === 429);
        setPreviewError({
          message: err instanceof Error ? err.message : 'Preview evaluation failed.',
          isQuota
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [code, meta, rawOcrTexts, templateSchema.blocks, values, versionId]
  );

  const promptMeta: PublicPromptMeta[] = promptEntries.map((p) => ({
    key: p.key,
    label: p.label,
    ...(p.description ? { description: p.description } : {}),
    taskType: p.taskType
  }));

  const ctx: BlockRuntimeContext = {
    values,
    meta,
    errors,
    setValue,
    setMeta: setFieldMeta,
    onRunOcr,
    onTriggerAction,
    isSubmitting,
    isPreview: true,
    exerciseTitle,
    totalMarks,
    promptMeta
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Preview Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3.5 text-amber-950">
        <div className="flex items-center gap-2.5 text-sm font-semibold">
          <Eye className="h-4 w-4 text-amber-700" />
          <span>
            PREVIEW MODE — Running against saved Version v{versionNumber} (Telegram notifications
            disabled)
          </span>
        </div>
        <button
          type="button"
          onClick={handleResetPreview}
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Preview
        </button>
      </div>

      {/* Preview Evaluation Result */}
      {previewResult && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-emerald-900">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <h3 className="text-base font-bold">Preview Evaluation Complete</h3>
                <p className="text-xs text-emerald-800">
                  Provider: {previewResult.provider} ({previewResult.model}) · Latency:{' '}
                  {previewResult.usage.latencyMs ?? '—'}ms
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/reports/${encodeURIComponent(previewResult.reportId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-navy px-4 py-2 text-xs font-semibold text-white hover:bg-brand-navy/90"
              >
                <span>Open Full Report Page</span>
                <ExternalLink className="h-3.5 w-3.5 text-brand-gold" />
              </Link>
              <button
                type="button"
                onClick={handleResetPreview}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Run Another Preview
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-3.5 border border-emerald-200">
              <div className="text-[11px] font-bold uppercase text-slate-500">Total Score</div>
              <div className="mt-1 text-2xl font-extrabold text-brand-navy">
                {previewResult.report.marks.total} / {previewResult.report.marks.total_max}
              </div>
            </div>
            <div className="rounded-xl bg-white p-3.5 border border-emerald-200">
              <div className="text-[11px] font-bold uppercase text-slate-500">Content</div>
              <div className="mt-1 text-2xl font-extrabold text-brand-navy">
                {previewResult.report.marks.content} / {previewResult.report.marks.content_max}
              </div>
            </div>
            <div className="rounded-xl bg-white p-3.5 border border-emerald-200">
              <div className="text-[11px] font-bold uppercase text-slate-500">Language</div>
              <div className="mt-1 text-2xl font-extrabold text-brand-navy">
                {previewResult.report.marks.language} / {previewResult.report.marks.language_max}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white p-3.5 border border-emerald-200 text-xs text-slate-700 space-y-1">
            <p>
              <strong>Content Verdict:</strong> {previewResult.report.justification.content}
            </p>
            <p>
              <strong>Language Verdict:</strong> {previewResult.report.justification.language}
            </p>
          </div>
        </div>
      )}

      {previewError && (
        <div
          role="alert"
          className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
            previewError.isQuota
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{previewError.message}</span>
        </div>
      )}

      {/* Real Lego Runtime */}
      <TemplateRenderer template={templateSchema} ctx={ctx} />
    </div>
  );
}
