'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  TemplateRenderer,
  type BlockActionHandler,
  type BlockFieldErrors,
  type BlockFormValues,
  type BlockOcrHandler,
  type BlockRuntimeContext
} from '@edumenai/blocks';
import type { TemplateBlock, TranscriptionMeta } from '@edumenai/shared';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import {
  ApiError,
  fetchPublishedExercise,
  runExerciseEvaluate,
  runExerciseOcr,
  type PublishedExerciseDetail
} from '../lib/api';

interface ExerciseRunnerProps {
  code: string;
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
  const record = value as Record<string, unknown>;
  return typeof record.pages_detected === 'number';
}

export function ExerciseRunner({ code }: ExerciseRunnerProps): React.ReactElement {
  const router = useRouter();
  const [exercise, setExercise] = useState<PublishedExerciseDetail | null>(null);
  const [values, setValues] = useState<BlockFormValues>({});
  const [rawOcrTexts, setRawOcrTexts] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<BlockFieldErrors>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<{ message: string; isQuota?: boolean } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    void fetchPublishedExercise(code)
      .then((detail) => {
        if (cancelled) return;
        setExercise(detail);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load exercise.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

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

  const onRunOcr: BlockOcrHandler = useCallback(
    async ({ file, promptKey, fieldKey }) => {
      setSubmitError(null);
      const res = await runExerciseOcr(code, { file, promptKey });
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
    [code, setFieldMeta, setValue]
  );

  const onTriggerAction: BlockActionHandler = useCallback(
    async ({ block }) => {
      if (!exercise) return;
      setSubmitError(null);

      // 1. Validate required blocks
      const nextErrors: BlockFieldErrors = {};
      for (const b of exercise.templateSchema.blocks) {
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
        setSubmitError({
          message: 'Please complete all required fields before submitting for evaluation.'
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // 2. Locate target examiner_evaluation block
      const targetId = block.bindings?.targetActionBlockId;
      const evalBlock: TemplateBlock | undefined =
        (targetId
          ? exercise.templateSchema.blocks.find((b) => b.id === targetId)
          : undefined) ??
        exercise.templateSchema.blocks.find((b) => b.type === 'examiner_evaluation');

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
        setSubmitError({
          message: 'Both the task prompt and student response text are required for evaluation.'
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
        const result = await runExerciseEvaluate(code, {
          student: {
            name: studentName || 'Student',
            ...(studentClass ? { className: studentClass } : {}),
            ...(studentSchool ? { school: studentSchool } : {}),
            ...(studentTelegram ? { telegram: studentTelegram } : {})
          },
          taskPrompt,
          rawText: (studentTextKey ? rawOcrTexts[studentTextKey] : undefined) || studentText,
          finalText: studentText,
          ...(transcriptionMeta ? { transcriptionMeta } : {}),
          formData: values,
          ...(evalBlock?.bindings?.promptKeys
            ? { promptKeys: evalBlock.bindings.promptKeys }
            : {}),
          ...(evalBlock?.bindings?.telegramTargetIds
            ? { telegramTargetIds: evalBlock.bindings.telegramTargetIds }
            : {})
        });

        router.push(`/reports/${encodeURIComponent(result.reportId)}`);
      } catch (err: unknown) {
        const isQuota = err instanceof ApiError && Boolean(err.isQuotaError || err.status === 429);
        const message =
          err instanceof Error ? err.message : 'Evaluation failed. Please try again.';
        setSubmitError({ message, isQuota });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } finally {
        setIsSubmitting(false);
      }
    },
    [code, exercise, meta, rawOcrTexts, router, values]
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-brand-navy" />
          <span className="text-sm font-medium text-slate-700">Loading exercise workspace...</span>
        </div>
      </div>
    );
  }

  if (loadError || !exercise) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="text-base font-bold">Unable to load exercise</h2>
          <p className="mt-1 text-sm">{loadError || 'Exercise not found.'}</p>
          <Link
            href="/exercises"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-navy underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Exercises
          </Link>
        </div>
      </div>
    );
  }

  const ctx: BlockRuntimeContext = {
    values,
    meta,
    errors,
    setValue,
    setMeta: setFieldMeta,
    onRunOcr,
    onTriggerAction,
    isSubmitting,
    isPreview: false,
    exerciseTitle: exercise.title,
    totalMarks: exercise.totalMarks,
    promptMeta: exercise.promptMeta
  };

  const settings = exercise.templateSchema.settings;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-4">
        <Link
          href="/exercises"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand-navy"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Exercises
        </Link>
      </div>

      {/* Exercise Header */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-md bg-brand-navy px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-brand-gold">
            {exercise.skill} · {exercise.code}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Published v{exercise.activeVersion.version}
          </span>
        </div>

        <h1 className="mt-3 text-2xl font-bold text-brand-navy">{exercise.title}</h1>
        {exercise.description && (
          <p className="mt-1.5 text-sm text-slate-600">{exercise.description}</p>
        )}

        {settings.showHeaderBadges && settings.badges.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {settings.badges.map((badge, idx) => (
              <span
                key={idx}
                className="rounded-full border border-brand-gold/40 bg-brand-cream px-3 py-0.5 text-xs font-semibold text-brand-navy"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {submitError && (
        <div
          role="alert"
          className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            submitError.isQuota
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              {submitError.isQuota ? 'AI Provider Quota Exceeded' : 'Submission Error'}
            </p>
            <p className="mt-0.5">{submitError.message}</p>
          </div>
        </div>
      )}

      {/* Dynamic Lego Template */}
      <TemplateRenderer template={exercise.templateSchema} ctx={ctx} />
    </div>
  );
}
