'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { EnrollmentStatus, EnrollmentView } from '@edumenai/shared';
import { ApiError, fetchMyEnrollments } from '../../lib/api';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message.trim().length > 0) return err.message;
  if (err instanceof Error && err.message.trim().length > 0) return err.message;
  return fallback;
}

/** Blank / whitespace-only strings become `null` for the API. */
export function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function orDash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '—';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/* -------------------------------------------------------------------------- */
/*  Presentational primitives                                                 */
/* -------------------------------------------------------------------------- */

export type BannerKind = 'success' | 'error' | 'warning';

const BANNER_TONES: Record<BannerKind, string> = {
  success: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-800 ring-emerald-600/10',
  error: 'border-rose-200/80 bg-rose-50/80 text-rose-800 ring-rose-600/10',
  warning: 'border-amber-200/80 bg-amber-50/80 text-amber-900 ring-amber-600/10'
};

export function Banner({
  kind,
  children,
  className = ''
}: {
  kind: BannerKind;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'error' ? AlertCircle : AlertTriangle;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ring-1 backdrop-blur-md ${BANNER_TONES[kind]} ${className}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}

const STATUS_TONES: Record<EnrollmentStatus, string> = {
  APPROVED: 'bg-emerald-50/90 text-emerald-700 ring-emerald-600/20',
  PENDING: 'bg-amber-50/90 text-amber-800 ring-amber-600/20',
  REJECTED: 'bg-rose-50/90 text-rose-700 ring-rose-600/20'
};

const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  APPROVED: 'Approved',
  PENDING: 'Pending',
  REJECTED: 'Rejected'
};

export function StatusPill({ status }: { status: EnrollmentStatus }): React.ReactElement {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_TONES[status]}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          status === 'APPROVED'
            ? 'bg-emerald-500'
            : status === 'PENDING'
              ? 'bg-amber-500'
              : 'bg-rose-500'
        }`}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Field({
  id,
  label,
  hint,
  children
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  right
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-sm text-zinc-600">{description}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function SectionLoading({ label }: { label: string }): React.ReactElement {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 rounded-xl border border-white/80 bg-white/50 px-4 py-8 text-sm text-zinc-600"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300/80 bg-white/40 px-4 py-6 text-center text-sm text-zinc-600">
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Data hook                                                                 */
/* -------------------------------------------------------------------------- */

export interface EnrollmentsState {
  items: EnrollmentView[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Loads `/api/enrollments/my` client-side with a cancellation guard. */
export function useEnrollments(): EnrollmentsState {
  const [items, setItems] = useState<EnrollmentView[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMyEnrollments()
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, 'Could not load your connections.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback((): void => {
    setVersion((v) => v + 1);
  }, []);

  return { items, loading, error, reload };
}
