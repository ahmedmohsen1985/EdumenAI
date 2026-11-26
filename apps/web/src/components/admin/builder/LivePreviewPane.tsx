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
  MediaAttachment,
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
  mode?: 'admin' | 'instructor';
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

function isMediaAttachment(value: unknown): value is MediaAttachment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.mimeType === 'string' &&
    typeof record.fileName === 'string' &&
    (record.source === 'preset' || record.source === 'student')
  );
}

function collectPreviewMediaAttachments(
  blocks: readonly TemplateBlock[],
  values: BlockFormValues
): MediaAttachment[] {
  const attachments: MediaAttachment[] = [];
  for (const b of blocks) {
    if (b.type !== 'media_upload') continue;
    const val = b.fieldKey ? values[b.fieldKey] : undefined;
    if (isMediaAttachment(val)) {
      attachments.push(val);
      continue;
    }
    const presetUrl =
      typeof b.props?.presetImageDataUrl === 'string' ? b.props.presetImageDataUrl.trim() : '';
    if (presetUrl) {
      const presetName =
        typeof b.props?.presetImageName === 'string' && b.props.presetImageName.trim()
          ? b.props.presetImageName.trim()
          : b.label || 'Stimulus Media';
      const presetMime =
        typeof b.props?.presetImageMimeType === 'string' && b.props.presetImageMimeType.trim()
          ? b.props.presetImageMimeType.trim()
          : 'image/jpeg';
      attachments.push({
        dataUrl: presetUrl,
        mimeType: presetMime,
        fileName: presetName,
        source: 'preset',
        presetBlockId: b.id
      });
    }
  }
  return attachments.slice(0, 4);
}

export function LivePreviewPane({
  code,
  exerciseTitle,
  totalMarks,
  versionId,
  versionNumber,
  templateSchema,
  promptEntries,
  mode = 'admin'
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
        ...(mode === 'admin' ? { adminKey: getStoredAdminKey() } : {})
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
    [code, mode, setFieldMeta, setValue, versionId]
  );

  const onTriggerAction: BlockActionHandler = useCallback(
    async ({ block }) => {
      setPreviewError(null);

      const nextErrors: BlockFieldErrors = {};
      for (const b of templateSchema.blocks) {
        if (b.required && b.fieldKey) {
          const val = values[b.fieldKey];
          if (b.type === 'media_upload') {
            const hasPreset =
              typeof b.props?.presetImageDataUrl === 'string' &&
              b.props.presetImageDataUrl.trim().length > 0;
            if (!isMediaAttachment(val) && !hasPreset) {
              nextErrors[b.fieldKey] = `${b.label || b.fieldKey} is required.`;
            }
          } else {
            const strVal = typeof val === 'string' ? val.trim() : '';
            if (!strVal) {
              nextErrors[b.fieldKey] = `${b.label || b.fieldKey} is required.`;
            }
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

      const mediaAttachments = collectPreviewMediaAttachments(templateSchema.blocks, values);

      if (!studentText || (!taskPrompt.trim() && mediaAttachments.length === 0)) {
        setPreviewError({
          message:
            'A student response and either a task prompt or attached stimulus media are required for AI evaluation.'
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
            ...(mediaAttachments.length > 0 ? { mediaAttachments } : {}),
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
          mode === 'admin' ? { adminKey: getStoredAdminKey() } : undefined
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
    [code, meta, mode, rawOcrTexts, templateSchema.blocks, values, versionId]
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/80 bg-amber-50/85 px-5 py-3.5 text-amber-950 shadow-sm backdrop-blur-md">
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
          className="glass-btn-secondary !inline-flex !items-center !gap-1.5 !border-amber-300/80 !px-3 !py-1.5 !text-xs !text-amber-900 hover:!bg-amber-100/80"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Preview
        </button>
      </div>

      {/* Preview Evaluation Result */}
      {previewResult && (
        <div className="space-y-4 rounded-2xl border border-emerald-300/80 bg-emerald-50/85 p-6 shadow-glass backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-emerald-900">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <h3 className="text-base font-bold tracking-tight">Preview Evaluation Complete</h3>
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
                className="glass-btn-primary !inline-flex !items-center !gap-1.5 !px-4 !py-2 !text-xs"
              >
                <span>Open Full Report Page</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={handleResetPreview}
                className="glass-btn-secondary !inline-flex !items-center !gap-1.5 !border-emerald-300/80 !px-3.5 !py-2 !text-xs !text-emerald-900 hover:!bg-emerald-100/80"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Run Another Preview
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/85 bg-white/80 p-3.5 shadow-sm backdrop-blur-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Total Score
              </div>
              <div className="mt-1 text-2xl font-extrabold text-zinc-900">
                {previewResult.report.marks.total} / {previewResult.report.marks.total_max}
              </div>
            </div>
            <div className="rounded-xl border border-white/85 bg-white/80 p-3.5 shadow-sm backdrop-blur-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Content
              </div>
              <div className="mt-1 text-2xl font-extrabold text-zinc-900">
                {previewResult.report.marks.content} / {previewResult.report.marks.content_max}
              </div>
            </div>
            <div className="rounded-xl border border-white/85 bg-white/80 p-3.5 shadow-sm backdrop-blur-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Language
              </div>
              <div className="mt-1 text-2xl font-extrabold text-zinc-900">
                {previewResult.report.marks.language} / {previewResult.report.marks.language_max}
              </div>
            </div>
          </div>

          <div className="space-y-1 rounded-xl border border-white/85 bg-white/80 p-3.5 text-xs text-zinc-700 shadow-sm backdrop-blur-sm">
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
          className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm backdrop-blur-sm ${
            previewError.isQuota
              ? 'border-amber-300/85 bg-amber-50/85 text-amber-900'
              : 'border-rose-200/85 bg-rose-50/85 text-rose-800'
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{previewError.message}</span>
        </div>
      )}

      {/* Auto Student Profile Card (read-only preview strip) */}
      <div className="glass-panel flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-xs text-zinc-600">
        <span className="glass-pill">Auto Student Profile Card</span>
        <span>
          Student Name, School, Instructor/Self-Study &amp; Telegram ID are auto-filled from the
          student&apos;s account at runtime — legacy identity inputs are hidden.
        </span>
      </div>

      {/* Real Lego Runtime */}
      <TemplateRenderer template={templateSchema} ctx={ctx} />
    </div>
  );
}
