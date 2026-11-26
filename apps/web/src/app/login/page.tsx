'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AuthUserView, TwoFactorChallengeView } from '@edumenai/shared';
import { Loader2, LogIn } from 'lucide-react';
import { useAuth } from '../../components/auth/AuthProvider';
import { getPostLoginPath, sanitizeNextPath } from '../../components/auth/auth-utils';
import { TwoFactorChallengeCard } from '../../components/auth/TwoFactorChallengeCard';
import { PageEntrance } from '../../components/ui/MotionPrimitives';
import { validateStrictEmail } from '../../lib/validation';

function LoginForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams.get('next'));
  const { user, isLoading, login, completeAuthSession } = useAuth();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [emailTouched, setEmailTouched] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<TwoFactorChallengeView | null>(null);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(getPostLoginPath(user, next));
    }
  }, [isLoading, user, next, router]);

  const emailError = emailTouched ? validateStrictEmail(email) : null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) return;
    setEmailTouched(true);
    setError(null);

    const eErr = validateStrictEmail(email);
    if (eErr) {
      setError(eErr);
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(email.trim(), password);
      if (result.requiresTwoFactor) {
        setChallenge(result.challenge);
        setSubmitting(false);
        return;
      }
      router.replace(getPostLoginPath(result.user, next));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Please try again.');
      setSubmitting(false);
    }
  };

  const handleChallengeVerified = (verifiedUser: AuthUserView): void => {
    completeAuthSession(verifiedUser);
    router.replace(getPostLoginPath(verifiedUser, next));
  };

  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : '/register';

  return (
    <PageEntrance className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <div className="glass-panel-strong p-6 sm:p-8">
        {challenge ? (
          <TwoFactorChallengeCard
            challenge={challenge}
            onVerified={handleChallengeVerified}
            onChallengeUpdated={(nextChallenge) => setChallenge(nextChallenge)}
            onBack={() => {
              setChallenge(null);
              setError(null);
            }}
          />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Welcome back</h1>
              <p className="mt-1 text-sm text-zinc-600">Sign in to continue your practice.</p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-sm font-medium text-rose-700"
              >
                {error}
              </div>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="login-email" className="text-xs font-semibold text-zinc-600">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  disabled={submitting}
                  aria-invalid={Boolean(emailError)}
                  className={`glass-input ${emailError ? '!border-rose-300 focus:!border-rose-400 focus:!ring-rose-500/15' : ''}`}
                  placeholder="you@example.com"
                />
                {emailError && <p className="text-xs font-medium text-rose-700">{emailError}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="text-xs font-semibold text-zinc-600">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-semibold text-zinc-700 underline-offset-4 hover:text-zinc-900 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="glass-input"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || Boolean(emailError)}
                className="glass-btn-primary w-full"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                )}
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-zinc-600">
              New to EdumenAI?{' '}
              <Link
                href={registerHref}
                className="font-semibold text-zinc-900 underline-offset-4 hover:underline"
              >
                Create account
              </Link>
            </p>
          </>
        )}
      </div>
    </PageEntrance>
  );
}

export default function LoginPage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
