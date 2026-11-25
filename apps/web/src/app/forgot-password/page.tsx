'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { requestPasswordReset } from '../../lib/api';
import { PageEntrance } from '../../components/ui/MotionPrimitives';

const FALLBACK_MESSAGE =
  'If an account exists for that email, we have sent password reset instructions.';

export default function ForgotPasswordPage(): React.ReactElement {
  const [email, setEmail] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const message = await requestPasswordReset(email.trim());
      setConfirmation(message.trim() ? message : FALLBACK_MESSAGE);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageEntrance className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <div className="glass-panel-strong p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Forgot password?</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Enter your email and we will send you a link to reset it.
          </p>
        </div>

        {confirmation ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-3 text-sm font-medium text-emerald-800"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{confirmation}</span>
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
                <label htmlFor="forgot-email" className="text-xs font-semibold text-zinc-600">
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  className="glass-input"
                  placeholder="you@example.com"
                />
              </div>
              <button type="submit" disabled={submitting} className="glass-btn-primary w-full">
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Mail className="h-4 w-4" aria-hidden="true" />
                )}
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 font-semibold text-zinc-700 underline-offset-4 hover:text-zinc-900 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to sign in
          </Link>
        </p>
      </div>
    </PageEntrance>
  );
}
