'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { resetPassword } from '../../lib/api';
import { PageEntrance } from '../../components/ui/MotionPrimitives';

function ResetPasswordForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = (searchParams.get('token') ?? '').trim();

  const [password, setPassword] = useState<string>('');
  const [confirm, setConfirm] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const message = await resetPassword({ token, password });
      setDone(message.trim() ? message : 'Your password has been updated. Redirecting to sign in…');
      redirectTimer.current = setTimeout(() => router.replace('/login'), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to reset password. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <PageEntrance className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <div className="glass-panel-strong p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Set a new password</h1>
          <p className="mt-1 text-sm text-zinc-600">Choose a strong password of at least 8 characters.</p>
        </div>

        {!token ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-3 text-sm font-medium text-rose-700"
          >
            This reset link is missing or invalid.{' '}
            <Link href="/forgot-password" className="font-semibold underline underline-offset-4">
              Request a new link
            </Link>
            .
          </div>
        ) : done ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-3 text-sm font-medium text-emerald-800"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{done}</span>
          </div>
        ) : (
          <>
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-sm font-medium text-rose-700"
              >
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="reset-password" className="text-xs font-semibold text-zinc-600">
                  New password
                </label>
                <input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="glass-input"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="reset-confirm" className="text-xs font-semibold text-zinc-600">
                  Confirm new password
                </label>
                <input
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={submitting}
                  className="glass-input"
                />
              </div>
              <button type="submit" disabled={submitting} className="glass-btn-primary w-full">
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                )}
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm">
          <Link
            href="/login"
            className="font-semibold text-zinc-700 underline-offset-4 hover:text-zinc-900 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </PageEntrance>
  );
}

export default function ResetPasswordPage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
