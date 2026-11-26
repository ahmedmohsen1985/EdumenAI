'use client';

import React, { useEffect, useState } from 'react';
import type { AuthUserView, TwoFactorChallengeView } from '@edumenai/shared';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles
} from 'lucide-react';
import {
  resendAuthOtp,
  verifyLogin2fa,
  verifyRegistrationOtp
} from '../../lib/api';

interface TwoFactorChallengeCardProps {
  challenge: TwoFactorChallengeView;
  onVerified: (user: AuthUserView) => void;
  onChallengeUpdated: (next: TwoFactorChallengeView) => void;
  onBack: () => void;
}

const RESEND_COOLDOWN_SECONDS = 45;

export function TwoFactorChallengeCard({
  challenge,
  onVerified,
  onChallengeUpdated,
  onBack
}: TwoFactorChallengeCardProps): React.ReactElement {
  const [code, setCode] = useState<string>('');
  const [trustDevice, setTrustDevice] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(
    challenge.method === 'EMAIL_OTP' ? RESEND_COOLDOWN_SECONDS : 0
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isRegistration = challenge.purpose === 'REGISTER_VERIFY';
  const isTotp = challenge.method === 'TOTP';

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (submitting) return;
    const cleaned = code.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length !== 6) {
      setError('Enter the 6-digit verification code.');
      return;
    }

    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const payload = {
        challengeToken: challenge.challengeToken,
        code: cleaned,
        trustDevice
      };
      const verifiedUser = isRegistration
        ? await verifyRegistrationOtp(payload)
        : await verifyLogin2fa(payload);
      onVerified(verifiedUser);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Invalid or expired verification code. Please try again.'
      );
      setSubmitting(false);
    }
  };

  const handleResend = async (): Promise<void> => {
    if (resending || cooldown > 0 || isTotp) return;
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      const nextChallenge = await resendAuthOtp(challenge.challengeToken);
      onChallengeUpdated(nextChallenge);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice(`A fresh 6-digit code was sent to ${nextChallenge.maskedEmail}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to resend code right now.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        disabled={submitting}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>

      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-sm">
          {isTotp ? <Smartphone className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
        </span>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-zinc-950">
            {isRegistration ? 'Verify your email' : 'Two-Factor Verification'}
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            {isTotp ? (
              <>
                Enter the 6-digit code from your{' '}
                <strong className="text-zinc-900">
                  Authenticator App (Google / Microsoft Authenticator)
                </strong>
                .
              </>
            ) : (
              <>
                We sent a 6-digit security code to{' '}
                <strong className="text-zinc-900">{challenge.maskedEmail}</strong>.
              </>
            )}
          </p>
        </div>
      </div>

      {challenge.devOtpHint && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/80 bg-amber-50/85 px-3.5 py-2.5 text-xs text-amber-950">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Sparkles className="h-3.5 w-3.5 text-amber-700" />
            Dev Mode Verification Code:{' '}
            <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono font-bold tracking-wider">
              {challenge.devOtpHint}
            </code>
          </span>
          <button
            type="button"
            onClick={() => {
              setCode(challenge.devOtpHint ?? '');
              setError(null);
            }}
            className="rounded-lg border border-amber-300 bg-white/85 px-2 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-white"
          >
            Click to fill
          </button>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/85 px-3.5 py-2.5 text-xs font-medium text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-xs font-medium text-rose-700"
        >
          {error}
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="otp-code-input" className="text-xs font-semibold text-zinc-600">
            6-Digit Verification Code
          </label>
          <input
            id="otp-code-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(digits);
              if (error) setError(null);
            }}
            disabled={submitting}
            placeholder="000000"
            className="glass-input text-center font-mono text-xl font-bold tracking-[0.45em]"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200/70 bg-white/60 px-3.5 py-2.5 text-xs font-medium text-zinc-700">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
            disabled={submitting}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
          />
          <span>Trust this device for 30 days</span>
        </label>

        <button
          type="submit"
          disabled={submitting || code.length !== 6}
          className="glass-btn-primary w-full"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          )}
          {submitting
            ? 'Verifying…'
            : isRegistration
              ? 'Verify & Complete Sign Up'
              : 'Verify & Sign In'}
        </button>
      </form>

      {!isTotp && (
        <div className="flex items-center justify-between border-t border-zinc-900/[0.06] pt-4 text-xs text-zinc-600">
          <span>Didn&apos;t receive the code?</span>
          <button
            type="button"
            disabled={resending || cooldown > 0}
            onClick={() => void handleResend()}
            className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 transition-colors hover:underline disabled:cursor-not-allowed disabled:text-zinc-400 disabled:no-underline"
          >
            {resending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
        </div>
      )}
    </div>
  );
}
