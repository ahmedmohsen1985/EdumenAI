'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Coins, History, Loader2, Save } from 'lucide-react';
import type {
  AuthUserView,
  CreditTransactionType,
  MyCreditsPayload,
  UpdateProfileRequest
} from '@edumenai/shared';
import { fetchMyCredits, updateMyProfile } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { Banner, Field, SectionTitle, errorMessage, toNullable } from './shared';

function formatTxTypeLabel(type: CreditTransactionType): string {
  switch (type) {
    case 'WELCOME_BONUS':
      return 'Welcome Bonus';
    case 'TOP_UP':
      return 'Top-Up';
    case 'DEDUCTION':
      return 'AI Usage';
    case 'ADJUSTMENT':
      return 'Adjustment';
    case 'REFUND':
      return 'Refund';
  }
}

export interface ProfileTabProps {
  user: AuthUserView;
  onSaved: () => Promise<unknown>;
}

export function ProfileTab({ user, onSaved }: ProfileTabProps): React.ReactElement {
  const { isLowCredit: authLowCredit, lowCreditThreshold: authLowThreshold } = useAuth();
  const [name, setName] = useState<string>(user.name ?? '');
  const [school, setSchool] = useState<string>(user.school ?? '');
  const [className, setClassName] = useState<string>(user.className ?? '');
  const [telegramId, setTelegramId] = useState<string>(user.telegramId ?? '');
  const [parentPhone, setParentPhone] = useState<string>(user.parentPhone ?? '');
  const [parentTelegramId, setParentTelegramId] = useState<string>(user.parentTelegramId ?? '');
  const [bio, setBio] = useState<string>(user.bio ?? '');
  const [sponsor, setSponsor] = useState<boolean>(user.sponsorStudentCredits);
  const [saving, setSaving] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creditsPayload, setCreditsPayload] = useState<MyCreditsPayload | null>(null);
  const [creditsLoading, setCreditsLoading] = useState<boolean>(true);
  const [creditsError, setCreditsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCreditsLoading(true);
    setCreditsError(null);
    void fetchMyCredits(30)
      .then((data) => {
        if (!cancelled) setCreditsPayload(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCreditsError(
            err instanceof Error ? err.message : 'Unable to load credit history.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setCreditsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user.creditBalance]);

  const effectiveLowCredit = creditsPayload ? creditsPayload.isLowCredit : authLowCredit;
  const effectiveThreshold = creditsPayload
    ? creditsPayload.lowCreditThreshold
    : authLowThreshold;
  const effectiveBalance = creditsPayload ? creditsPayload.creditBalance : user.creditBalance;

  const isStudent = user.role === 'STUDENT';
  const isInstructor = user.role === 'INSTRUCTOR';
  const isAdmin = user.role === 'ADMIN';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSuccess(null);
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }

    let payload: UpdateProfileRequest;
    if (isStudent) {
      payload = {
        name: trimmedName,
        school: toNullable(school),
        className: toNullable(className),
        telegramId: toNullable(telegramId),
        parentPhone: toNullable(parentPhone),
        parentTelegramId: toNullable(parentTelegramId)
      };
    } else if (isInstructor) {
      payload = {
        name: trimmedName,
        school: toNullable(school),
        bio: toNullable(bio),
        sponsorStudentCredits: sponsor
      };
    } else {
      payload = {
        name: trimmedName,
        school: toNullable(school),
        telegramId: toNullable(telegramId)
      };
    }

    setSaving(true);
    try {
      await updateMyProfile(payload);
      await onSaved();
      setSuccess('Profile saved.');
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not save your profile. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="glass-panel space-y-5 p-5 sm:p-6"
        noValidate
      >
        <SectionTitle
          title="Profile details"
          description={
            isStudent
              ? 'Your instructors and parents use these details to reach you.'
              : isInstructor
                ? 'Students see your name, school and bio when requesting you.'
                : 'Your administrator profile details.'
          }
        />

        {success ? <Banner kind="success">{success}</Banner> : null}
        {error ? <Banner kind="error">{error}</Banner> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="profile-name" label="Name">
            <input
              id="profile-name"
              className="glass-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoComplete="name"
              required
            />
          </Field>
          <Field id="profile-school" label="School">
            <input
              id="profile-school"
              className="glass-input"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              maxLength={160}
              autoComplete="organization"
            />
          </Field>

          {isStudent ? (
            <>
              <Field id="profile-class" label="Class">
                <input
                  id="profile-class"
                  className="glass-input"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  maxLength={120}
                />
              </Field>
              <Field id="profile-telegram" label="Student Telegram ID">
                <input
                  id="profile-telegram"
                  className="glass-input"
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  maxLength={120}
                  placeholder="@username"
                />
              </Field>
              <Field id="profile-parent-phone" label="Parent Phone">
                <input
                  id="profile-parent-phone"
                  className="glass-input"
                  type="tel"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  maxLength={40}
                  autoComplete="tel"
                />
              </Field>
              <Field id="profile-parent-telegram" label="Parent Telegram ID">
                <input
                  id="profile-parent-telegram"
                  className="glass-input"
                  value={parentTelegramId}
                  onChange={(e) => setParentTelegramId(e.target.value)}
                  maxLength={120}
                  placeholder="@username"
                />
              </Field>
            </>
          ) : null}

          {isAdmin ? (
            <Field id="profile-telegram" label="Telegram ID">
              <input
                id="profile-telegram"
                className="glass-input"
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                maxLength={120}
                placeholder="@username"
              />
            </Field>
          ) : null}
        </div>

        {isInstructor ? (
          <>
            <Field id="profile-bio" label="Bio" hint={`${bio.length}/1000`}>
              <textarea
                id="profile-bio"
                className="glass-input min-h-[7rem] resize-y"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={1000}
              />
            </Field>

            <div className="flex items-start justify-between gap-4 rounded-xl border border-white/80 bg-white/55 p-4 ring-1 ring-zinc-900/[0.05]">
              <div className="min-w-0">
                <p id="sponsor-label" className="text-sm font-semibold text-zinc-900">
                  Sponsor Student Credits
                </p>
                <p id="sponsor-desc" className="mt-1 text-sm text-zinc-600">
                  When on, AI-graded submissions from your approved students are paid from your
                  credit balance instead of theirs.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={sponsor}
                aria-labelledby="sponsor-label"
                aria-describedby="sponsor-desc"
                onClick={() => setSponsor((v) => !v)}
                className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/15 ${
                  sponsor ? 'bg-zinc-900' : 'bg-zinc-300'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    sponsor ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </>
        ) : null}

        <div className="flex justify-end">
          <button type="submit" className="glass-btn-primary" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <aside className="space-y-4" aria-label="Credit balance and usage">
        <div className="glass-panel-strong p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <Coins className="h-4 w-4" aria-hidden="true" />
              Credit Balance
            </div>
            {creditsPayload?.enforceCredits && (
              <span className="glass-pill !text-[10px]">Enforced</span>
            )}
          </div>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight text-zinc-900 tabular-nums">
              {effectiveBalance}
            </span>
            <span className="text-sm font-medium text-zinc-600">Credits</span>
          </p>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            {isInstructor
              ? 'Credits fund AI grading. Turn on sponsorship to cover your students’ submissions.'
              : 'Credits are spent when AI grades your submissions.'}
          </p>

          {effectiveLowCredit && (
            <div
              role="status"
              className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/80 bg-amber-50/85 p-3 text-xs text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold">Low Credit Warning</p>
                <p className="mt-0.5 leading-relaxed">
                  Your balance is at or below {effectiveThreshold} credits. Contact an administrator
                  to top up your account.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Credit Usage & Transaction History */}
        <section className="glass-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-900/[0.06] px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-600">
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Credit History
            </div>
            {creditsPayload && (
              <span className="text-[11px] font-medium text-zinc-400">
                Last {creditsPayload.transactions.length}
              </span>
            )}
          </div>

          {creditsLoading ? (
            <div className="flex items-center gap-2 px-4 py-6 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading transactions...
            </div>
          ) : creditsError ? (
            <div className="px-4 py-4 text-xs text-rose-700">{creditsError}</div>
          ) : !creditsPayload || creditsPayload.transactions.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-500">
              No credit transactions recorded yet.
            </div>
          ) : (
            <ul className="max-h-80 divide-y divide-zinc-900/[0.05] overflow-y-auto">
              {creditsPayload.transactions.map((tx) => {
                const isPositive = tx.amount > 0;
                return (
                  <li key={tx.id} className="px-4 py-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-900">
                        {formatTxTypeLabel(tx.type)}
                      </span>
                      <span
                        className={`shrink-0 whitespace-nowrap font-bold tabular-nums ${
                          isPositive ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {isPositive ? `+${tx.amount}` : tx.amount} cr
                      </span>
                    </div>
                    {(tx.note || tx.operation) && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-600">
                        {tx.note || `Operation: ${tx.operation}`}
                      </p>
                    )}
                    <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400">
                      <span>
                        {new Date(tx.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      <span className="tabular-nums">Bal: {tx.balanceAfter}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
