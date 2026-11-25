'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type {
  IntegrityEventType,
  IntegrityLog,
  TemplateBlock,
  TemplateConfig,
  TranscriptionMeta
} from '@edumenai/shared';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Coins,
  GraduationCap,
  Loader2,
  Lock,
  LogIn,
  MessageSquare,
  Pencil,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users
} from 'lucide-react';
import {
  ApiError,
  fetchPublishedExercise,
  PUBLIC_CACHE_KEYS,
  runExerciseEvaluate,
  runExerciseOcr,
  type PublishedExerciseDetail
} from '../lib/api';
import { getCached, isCacheFresh } from '../lib/client-cache';
import { useAuth } from './auth/AuthProvider';
import { PageEntrance } from './ui/MotionPrimitives';

interface ExerciseRunnerProps {
  code: string;
}

const LEGACY_IDENTITY_FIELD_KEYS = new Set<string>([
  'student_name',
  'name',
  'student_school',
  'school',
  'student_class',
  'class_name',
  'classname',
  'student_telegram',
  'telegram',
  'student_telegram_id'
]);

function isLegacyIdentityBlock(block: TemplateBlock): boolean {
  if (block.type !== 'input' || !block.fieldKey) return false;
  return LEGACY_IDENTITY_FIELD_KEYS.has(block.fieldKey.trim().toLowerCase());
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
  const {
    user,
    approvedInstructors,
    isLoading: authLoading,
    isLowCredit,
    lowCreditThreshold,
    refreshAuth
  } = useAuth();

  const initialExercise = getCached<PublishedExerciseDetail>(
    PUBLIC_CACHE_KEYS.publishedExercise(code)
  );
  const [exercise, setExercise] = useState<PublishedExerciseDetail | null>(initialExercise);
  const [values, setValues] = useState<BlockFormValues>({});
  const [rawOcrTexts, setRawOcrTexts] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<BlockFieldErrors>({});
  const [isLoading, setIsLoading] = useState<boolean>(initialExercise === null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<{ message: string; isQuota?: boolean } | null>(
    null
  );
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null);
  const [targetInitialized, setTargetInitialized] = useState<boolean>(false);
  const [integrityToast, setIntegrityToast] = useState<string | null>(null);

  const isIntegrityActive = Boolean(user && exercise && exercise.integrityEnabled !== false);
  const integrityRef = useRef<IntegrityLog>({
    enabled: true,
    tabSwitchCount: 0,
    windowBlurCount: 0,
    pasteBlockedCount: 0,
    copyBlockedCount: 0,
    rightClickBlockedCount: 0,
    totalViolations: 0,
    events: []
  });
  const lastFocusLossMsRef = useRef<number>(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showIntegrityNotice = useCallback((message: string) => {
    setIntegrityToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setIntegrityToast(null);
    }, 4000);
  }, []);

  const recordIntegrityEvent = useCallback(
    (type: IntegrityEventType, detail?: string, notice?: string) => {
      const log = integrityRef.current;
      if (type === 'tab_switch') log.tabSwitchCount += 1;
      else if (type === 'window_blur') log.windowBlurCount += 1;
      else if (type === 'paste_blocked') log.pasteBlockedCount += 1;
      else if (type === 'copy_blocked' || type === 'cut_blocked') log.copyBlockedCount += 1;
      else if (type === 'right_click_blocked') log.rightClickBlockedCount += 1;

      log.totalViolations =
        log.tabSwitchCount +
        log.windowBlurCount +
        log.pasteBlockedCount +
        log.copyBlockedCount +
        log.rightClickBlockedCount;

      if (log.events.length < 100) {
        log.events.push({
          type,
          timestamp: new Date().toISOString(),
          ...(detail ? { detail: detail.slice(0, 200) } : {})
        });
      }

      if (notice) {
        showIntegrityNotice(notice);
      }
    },
    [showIntegrityNotice]
  );

  // Client-side Exam Integrity listeners (debounced visibilitychange + window blur)
  useEffect(() => {
    if (!isIntegrityActive) return undefined;

    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        const now = Date.now();
        if (now - lastFocusLossMsRef.current < 400) return;
        lastFocusLossMsRef.current = now;
        recordIntegrityEvent(
          'tab_switch',
          'Browser tab became hidden',
          'Tab switch recorded by Exam Integrity Protection.'
        );
      }
    };

    const handleWindowBlur = (): void => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastFocusLossMsRef.current < 400) return;
      lastFocusLossMsRef.current = now;
      recordIntegrityEvent(
        'window_blur',
        'Browser window lost focus',
        'Window focus loss recorded by Exam Integrity Protection.'
      );
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [isIntegrityActive, recordIntegrityEvent]);

  // Sync default submission target when approved instructors arrive
  useEffect(() => {
    if (authLoading) return;
    if (approvedInstructors.length === 0) {
      setSelectedInstructorId(null);
      setTargetInitialized(true);
      return;
    }
    if (!targetInitialized) {
      setSelectedInstructorId(approvedInstructors[0]?.id ?? null);
      setTargetInitialized(true);
      return;
    }
    if (
      selectedInstructorId !== null &&
      !approvedInstructors.some((inst) => inst.id === selectedInstructorId)
    ) {
      setSelectedInstructorId(approvedInstructors[0]?.id ?? null);
    }
  }, [approvedInstructors, authLoading, selectedInstructorId, targetInitialized]);

  // Fetch published exercise once authenticated
  useEffect(() => {
    if (authLoading || !user) return;

    const cacheKey = PUBLIC_CACHE_KEYS.publishedExercise(code);
    const cached = getCached<PublishedExerciseDetail>(cacheKey);
    if (cached) {
      setExercise(cached);
      setIsLoading(false);
      if (isCacheFresh(cacheKey, 30_000)) {
        return;
      }
    }

    let cancelled = false;
    if (!cached) {
      setIsLoading(true);
    }
    setLoadError(null);

    void fetchPublishedExercise(code)
      .then((detail) => {
        if (cancelled) return;
        setExercise(detail);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (!cached) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load exercise.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, code, user]);

  const filteredTemplateSchema = useMemo<TemplateConfig | null>(() => {
    if (!exercise) return null;
    return {
      ...exercise.templateSchema,
      blocks: exercise.templateSchema.blocks.filter((b) => !isLegacyIdentityBlock(b))
    };
  }, [exercise]);

  const resolvedInstructorId: string | null = useMemo(() => {
    if (exercise?.owner?.id) return exercise.owner.id;
    if (approvedInstructors.length === 0) return null;
    if (
      selectedInstructorId &&
      approvedInstructors.some((inst) => inst.id === selectedInstructorId)
    ) {
      return selectedInstructorId;
    }
    return null;
  }, [approvedInstructors, exercise?.owner?.id, selectedInstructorId]);

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
      if (!exercise || !filteredTemplateSchema || !user) return;
      setSubmitError(null);

      // 1. Validate required blocks (excluding suppressed legacy student identity inputs)
      const nextErrors: BlockFieldErrors = {};
      for (const b of filteredTemplateSchema.blocks) {
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

      // Resolve student identity from authenticated profile (fallback to any non-suppressed value)
      const studentName =
        user.name?.trim() ||
        getStringField(values, [fieldMap.studentName ?? '', 'student_name', 'name']) ||
        'Student';
      const studentClass =
        user.className?.trim() ||
        getStringField(values, [
          fieldMap.studentClass ?? '',
          'student_class',
          'class_name',
          'className'
        ]);
      const studentSchool =
        user.school?.trim() ||
        getStringField(values, [fieldMap.studentSchool ?? '', 'student_school', 'school']);
      const studentTelegram =
        user.telegramId?.trim() ||
        getStringField(values, [fieldMap.studentTelegram ?? '', 'student_telegram', 'telegram']);

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
            name: studentName,
            ...(studentClass ? { className: studentClass } : {}),
            ...(studentSchool ? { school: studentSchool } : {}),
            ...(studentTelegram ? { telegram: studentTelegram } : {})
          },
          instructorId: resolvedInstructorId,
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
            : {}),
          ...(isIntegrityActive
            ? {
                integrityLog: {
                  ...integrityRef.current,
                  enabled: true,
                  events: [...integrityRef.current.events]
                }
              }
            : {})
        });

        void refreshAuth();
        router.push(`/reports/${encodeURIComponent(result.reportId)}?autoDispatch=1`);
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
    [
      code,
      exercise,
      filteredTemplateSchema,
      isIntegrityActive,
      meta,
      rawOcrTexts,
      refreshAuth,
      resolvedInstructorId,
      router,
      user,
      values
    ]
  );

  // Auth loading state
  if (authLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="glass-panel-strong flex items-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">Verifying your account...</span>
        </div>
      </div>
    );
  }

  // Sign-In Gate
  if (!user) {
    const nextPath = `/exercises/${encodeURIComponent(code)}`;
    return (
      <PageEntrance className="mx-auto max-w-xl px-4 py-14 sm:px-6">
        <div className="mb-4">
          <Link
            href="/exercises"
            className="glass-btn-secondary !rounded-full !px-3.5 !py-1.5 text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Exercises
          </Link>
        </div>

        <div className="glass-panel-strong relative overflow-hidden p-8 text-center sm:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-white via-zinc-200/70 to-transparent blur-2xl"
          />
          <div className="relative">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_10px_24px_-8px_rgba(15,17,21,0.45)]">
              <Lock className="h-6 w-6" />
            </div>
            <div className="mt-4 flex justify-center">
              <span className="glass-pill">Account Required</span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-zinc-950">
              Sign In Required to Start Assessment
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-600">
              Your profile automatically attaches your name, school, class, Telegram ID, and
              instructor submission target to your AI examiner report.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href={`/login?next=${encodeURIComponent(nextPath)}`}
                className="glass-btn-primary"
              >
                <LogIn className="h-4 w-4" />
                Sign In
              </Link>
              <Link
                href={`/register?next=${encodeURIComponent(nextPath)}`}
                className="glass-btn-secondary"
              >
                <UserPlus className="h-4 w-4" />
                Create Student Account
              </Link>
            </div>
          </div>
        </div>
      </PageEntrance>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="glass-panel-strong flex items-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">Loading exercise workspace...</span>
        </div>
      </div>
    );
  }

  if (loadError || !exercise || !filteredTemplateSchema) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 p-6 text-rose-900 shadow-glass backdrop-blur-xl">
          <h2 className="text-base font-bold">Unable to load exercise</h2>
          <p className="mt-1 text-sm">{loadError || 'Exercise not found.'}</p>
          <Link href="/exercises" className="glass-btn-secondary mt-4">
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
  const hasMissingProfileInfo =
    !user.name?.trim() || !user.school?.trim() || !user.className?.trim() || !user.telegramId?.trim();

  return (
    <PageEntrance className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-4">
        <Link
          href="/exercises"
          className="glass-btn-secondary !rounded-full !px-3.5 !py-1.5 text-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Exercises
        </Link>
      </div>

      {/* Exercise Header */}
      <div className="glass-panel-strong relative mb-6 overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-white via-zinc-200/60 to-transparent blur-2xl"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-zinc-900 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
            {exercise.skill}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {isIntegrityActive && (
              <span className="glass-pill">
                <ShieldCheck className="h-3.5 w-3.5 text-zinc-600" />
                Exam Integrity Active
              </span>
            )}
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Published v{exercise.activeVersion.version}
            </span>
          </div>
        </div>

        <h1 className="relative mt-4 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
          {exercise.title}
        </h1>
        {exercise.description && (
          <p className="relative mt-2 text-sm leading-relaxed text-zinc-600 sm:text-base">
            {exercise.description}
          </p>
        )}

        {settings.showHeaderBadges && settings.badges.length > 0 && (
          <div className="relative mt-4 flex flex-wrap gap-2">
            {settings.badges.map((badge, idx) => (
              <span key={idx} className="glass-pill">
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Auto-Populated Student Identity Card */}
      <section
        aria-label="Student identity and submission target"
        className="glass-panel mb-6 p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900/[0.06] pb-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm">
              <UserCheck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-zinc-950">
                Student Identity Card
              </h2>
              <p className="text-xs text-zinc-500">
                Auto-filled from your account for this submission
              </p>
            </div>
          </div>

          <Link
            href="/profile"
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              hasMissingProfileInfo
                ? 'border border-amber-300/80 bg-amber-50/85 text-amber-900 hover:bg-amber-100/90'
                : 'glass-btn-secondary !rounded-full !px-3 !py-1 text-xs'
            }`}
          >
            <Pencil className="h-3 w-3" />
            {hasMissingProfileInfo ? 'Complete in Profile' : 'Edit in Profile'}
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/80 bg-white/60 px-3.5 py-2.5 ring-1 ring-zinc-900/[0.04]">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Student Name
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-zinc-900">
              {user.name?.trim() || 'Not set'}
            </div>
          </div>

          <div className="rounded-xl border border-white/80 bg-white/60 px-3.5 py-2.5 ring-1 ring-zinc-900/[0.04]">
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <Building2 className="h-3 w-3" />
              School
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-zinc-900">
              {user.school?.trim() || <span className="font-normal text-zinc-400">Not set</span>}
            </div>
          </div>

          <div className="rounded-xl border border-white/80 bg-white/60 px-3.5 py-2.5 ring-1 ring-zinc-900/[0.04]">
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <GraduationCap className="h-3 w-3" />
              Class
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-zinc-900">
              {user.className?.trim() || <span className="font-normal text-zinc-400">Not set</span>}
            </div>
          </div>

          <div className="rounded-xl border border-white/80 bg-white/60 px-3.5 py-2.5 ring-1 ring-zinc-900/[0.04]">
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              <MessageSquare className="h-3 w-3" />
              Telegram ID
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-zinc-900">
              {user.telegramId?.trim() || (
                <span className="font-normal text-zinc-400">Not set</span>
              )}
            </div>
          </div>
        </div>

        {/* Instructor / Submission Target Selector */}
        <div className="mt-4 flex flex-col gap-2.5 border-t border-zinc-900/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
            <Users className="h-4 w-4 text-zinc-500" />
            <span>Submission Target</span>
          </div>

          {exercise.owner ? (
            <span className="glass-pill !px-3 !py-1 text-xs">
              Instructor: {exercise.owner.name || 'Assigned Instructor'}
              {exercise.owner.school ? ` · ${exercise.owner.school}` : ''}
            </span>
          ) : approvedInstructors.length === 0 ? (
            <span className="glass-pill !px-3 !py-1 text-xs">
              Mode: Self-Study (Independent)
            </span>
          ) : approvedInstructors.length === 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="glass-pill !px-3 !py-1 text-xs">
                {resolvedInstructorId
                  ? `Instructor: ${approvedInstructors[0]!.name || 'Instructor'}`
                  : 'Mode: Self-Study (Independent)'}
              </span>
              <select
                aria-label="Submission target"
                value={resolvedInstructorId ?? ''}
                onChange={(e) => setSelectedInstructorId(e.target.value || null)}
                className="glass-input !w-auto !py-1.5 !text-xs"
              >
                <option value={approvedInstructors[0]!.id}>
                  Submit to {approvedInstructors[0]!.name || 'Instructor'}
                </option>
                <option value="">Self-Study (Independent)</option>
              </select>
            </div>
          ) : (
            <div className="w-full sm:w-72">
              <select
                aria-label="Submission target"
                value={resolvedInstructorId ?? ''}
                onChange={(e) => setSelectedInstructorId(e.target.value || null)}
                className="glass-input !py-2 !text-xs"
              >
                {approvedInstructors.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    Instructor: {inst.name || 'Instructor'}
                    {inst.school ? ` (${inst.school})` : ''}
                  </option>
                ))}
                <option value="">Self-Study (Independent)</option>
              </select>
            </div>
          )}
        </div>
        {/* Low-Credit Warning inside Student Identity Card */}
        {isLowCredit && (
          <div
            role="status"
            className="mt-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-amber-300/80 bg-amber-50/85 px-4 py-3 text-xs text-amber-900 backdrop-blur-md"
          >
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 shrink-0 text-amber-700" />
              <span>
                <strong>Low Credit Balance:</strong> You currently have{' '}
                <strong>{user.creditBalance}</strong> credit
                {user.creditBalance === 1 ? '' : 's'} remaining (warning threshold:{' '}
                {lowCreditThreshold}).
              </span>
            </div>
            <Link
              href="/profile"
              className="shrink-0 whitespace-nowrap rounded-lg border border-amber-300 bg-white/80 px-2.5 py-1 font-semibold text-amber-950 transition-colors hover:bg-white"
            >
              View Credits
            </Link>
          </div>
        )}
      </section>

      {/* Integrity Blocked Toast Notice */}
      {integrityToast && (
        <div
          role="status"
          className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-300/80 bg-amber-50/90 px-4 py-2.5 text-xs font-medium text-amber-900 shadow-glass backdrop-blur-xl"
        >
          <ShieldCheck className="h-4 w-4 shrink-0 text-amber-700" />
          <span>{integrityToast}</span>
        </div>
      )}

      {/* Error Banner */}
      {submitError && (
        <div
          role="alert"
          className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm backdrop-blur-xl shadow-glass ${
            submitError.isQuota
              ? 'border-amber-300/80 bg-amber-50/85 text-amber-900'
              : 'border-rose-200/80 bg-rose-50/85 text-rose-800'
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

      {/* Dynamic Lego Template (legacy identity inputs suppressed; protected when integrity enabled) */}
      <div
        onCopy={(e) => {
          if (!isIntegrityActive) return;
          e.preventDefault();
          recordIntegrityEvent(
            'copy_blocked',
            'Copy blocked inside assessment form',
            'Copying is disabled while Exam Integrity Protection is active.'
          );
        }}
        onPaste={(e) => {
          if (!isIntegrityActive) return;
          e.preventDefault();
          recordIntegrityEvent(
            'paste_blocked',
            'Paste blocked inside assessment form',
            'Pasting is disabled while Exam Integrity Protection is active.'
          );
        }}
        onCut={(e) => {
          if (!isIntegrityActive) return;
          e.preventDefault();
          recordIntegrityEvent(
            'cut_blocked',
            'Cut blocked inside assessment form',
            'Cutting text is disabled while Exam Integrity Protection is active.'
          );
        }}
        onContextMenu={(e) => {
          if (!isIntegrityActive) return;
          e.preventDefault();
          recordIntegrityEvent(
            'right_click_blocked',
            'Context menu blocked inside assessment form',
            'Right-click menu is disabled while Exam Integrity Protection is active.'
          );
        }}
      >
        <TemplateRenderer template={filteredTemplateSchema} ctx={ctx} />
      </div>
    </PageEntrance>
  );
}
