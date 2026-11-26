'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { GraduationCap, Info, Loader2, Search, UserPlus, Users } from 'lucide-react';
import type {
  AuthUserView,
  PublicInstructorView,
  RegisterRequest,
  TwoFactorChallengeView
} from '@edumenai/shared';
import { useAuth } from '../../components/auth/AuthProvider';
import { getPostLoginPath, sanitizeNextPath } from '../../components/auth/auth-utils';
import { PasswordStrengthMeter } from '../../components/auth/PasswordStrengthMeter';
import { TwoFactorChallengeCard } from '../../components/auth/TwoFactorChallengeCard';
import { PageEntrance, SlidingTabButton } from '../../components/ui/MotionPrimitives';
import { fetchPublicInstructors } from '../../lib/api';
import {
  validateClassName,
  validateFullName,
  validatePhone,
  validateSchoolName,
  validateStrictEmail,
  validateStrongPassword,
  validateTelegramUserId
} from '../../lib/validation';

type RegisterRole = 'STUDENT' | 'INSTRUCTOR';

const MAX_INSTRUCTORS = 20;

function optionalValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function landingPath(user: AuthUserView, next: string | null): string {
  if (!next && user.role === 'INSTRUCTOR' && user.accountStatus === 'PENDING_APPROVAL') {
    return '/profile';
  }
  return getPostLoginPath(user, next);
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string | null;
  hint?: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  minLength?: number;
}

function Field({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  type = 'text',
  autoComplete,
  required = false,
  disabled = false,
  placeholder,
  maxLength,
  minLength
}: FieldProps): React.ReactElement {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-semibold text-zinc-600">
        {label}
        {!required && <span className="ml-1 font-normal text-zinc-400">(optional)</span>}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={Boolean(error)}
        className={`glass-input ${error ? '!border-rose-300 focus:!border-rose-400 focus:!ring-rose-500/15' : ''}`}
      />
      {error ? (
        <p className="text-[11px] font-medium text-rose-700">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

function RegisterForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams.get('next'));
  const { user, isLoading, register, completeAuthSession } = useAuth();

  const [role, setRole] = useState<RegisterRole>('STUDENT');
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirm, setConfirm] = useState<string>('');
  const [school, setSchool] = useState<string>('');
  const [className, setClassName] = useState<string>('');
  const [telegramId, setTelegramId] = useState<string>('');
  const [parentPhone, setParentPhone] = useState<string>('');
  const [parentTelegramId, setParentTelegramId] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState<boolean>(false);

  const [instructors, setInstructors] = useState<PublicInstructorView[]>([]);
  const [instructorsLoading, setInstructorsLoading] = useState<boolean>(true);
  const [instructorsError, setInstructorsError] = useState<string | null>(null);
  const [instructorQuery, setInstructorQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<TwoFactorChallengeView | null>(null);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(landingPath(user, next));
    }
  }, [isLoading, user, next, router]);

  useEffect(() => {
    let cancelled = false;
    fetchPublicInstructors()
      .then((list) => {
        if (!cancelled) setInstructors(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setInstructorsError(
            err instanceof Error
              ? err.message
              : 'Could not load instructors. You can still sign up for Self-Study.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setInstructorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredInstructors = useMemo<PublicInstructorView[]>(() => {
    const q = instructorQuery.trim().toLowerCase();
    if (!q) return instructors;
    return instructors.filter((i) =>
      `${i.name ?? ''} ${i.school ?? ''}`.toLowerCase().includes(q)
    );
  }, [instructors, instructorQuery]);

  const markTouched = (field: string): void => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  const showErr = (field: string, err: string | null): string | null =>
    attemptedSubmit || touched[field] ? err : null;

  const rawNameErr = validateFullName(name);
  const rawEmailErr = validateStrictEmail(email);
  const rawPasswordErr = validateStrongPassword(password);
  const rawConfirmErr =
    confirm !== password ? 'Passwords do not match.' : !confirm ? 'Confirm your password.' : null;
  const rawSchoolErr = validateSchoolName(school, false);
  const rawClassErr = role === 'STUDENT' ? validateClassName(className, false) : null;
  const rawTelegramErr = role === 'STUDENT' ? validateTelegramUserId(telegramId, false) : null;
  const rawParentPhoneErr = role === 'STUDENT' ? validatePhone(parentPhone, false) : null;
  const rawParentTelegramErr =
    role === 'STUDENT' ? validateTelegramUserId(parentTelegramId, false) : null;

  const firstValidationError =
    rawNameErr ||
    rawEmailErr ||
    rawPasswordErr ||
    rawConfirmErr ||
    rawSchoolErr ||
    rawClassErr ||
    rawTelegramErr ||
    rawParentPhoneErr ||
    rawParentTelegramErr;

  const toggleInstructor = (id: string): void => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_INSTRUCTORS) return prev;
      return [...prev, id];
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) return;
    setAttemptedSubmit(true);
    setError(null);

    if (firstValidationError) {
      setError(firstValidationError);
      return;
    }

    const payload: RegisterRequest =
      role === 'STUDENT'
        ? {
            email: email.trim(),
            password,
            name: name.trim(),
            role,
            school: optionalValue(school),
            className: optionalValue(className),
            telegramId: optionalValue(telegramId),
            parentPhone: optionalValue(parentPhone),
            parentTelegramId: optionalValue(parentTelegramId),
            ...(selectedIds.length > 0 ? { instructorIds: selectedIds } : {})
          }
        : {
            email: email.trim(),
            password,
            name: name.trim(),
            role,
            school: optionalValue(school),
            bio: optionalValue(bio)
          };

    setSubmitting(true);
    try {
      const result = await register(payload);
      if (result.requiresVerification) {
        setChallenge(result.challenge);
        setSubmitting(false);
        return;
      }
      router.replace(landingPath(result.user, next));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create account. Please try again.');
      setSubmitting(false);
    }
  };

  const handleVerified = (verifiedUser: AuthUserView): void => {
    completeAuthSession(verifiedUser);
    router.replace(landingPath(verifiedUser, next));
  };

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

  return (
    <PageEntrance className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <div className="glass-panel-strong p-6 sm:p-8">
        {challenge ? (
          <TwoFactorChallengeCard
            challenge={challenge}
            onVerified={handleVerified}
            onChallengeUpdated={(nextChallenge) => setChallenge(nextChallenge)}
            onBack={() => {
              setChallenge(null);
              setError(null);
            }}
          />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
                Create your account
              </h1>
              <p className="mt-1 text-sm text-zinc-600">
                Join EdumenAI as a student or apply as an instructor.
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Account role"
              className="mb-6 grid grid-cols-2 gap-1 rounded-2xl border border-zinc-200/80 bg-white/60 p-1 backdrop-blur-md"
            >
              <SlidingTabButton
                layoutId="register-role-pill"
                isActive={role === 'STUDENT'}
                asTab
                onClick={() => {
                  setRole('STUDENT');
                  setError(null);
                }}
                className="justify-center"
              >
                <Users className="h-4 w-4" aria-hidden="true" />
                Student
              </SlidingTabButton>
              <SlidingTabButton
                layoutId="register-role-pill"
                isActive={role === 'INSTRUCTOR'}
                asTab
                onClick={() => {
                  setRole('INSTRUCTOR');
                  setError(null);
                }}
                className="justify-center"
              >
                <GraduationCap className="h-4 w-4" aria-hidden="true" />
                Instructor
              </SlidingTabButton>
            </div>

            {role === 'INSTRUCTOR' && (
              <div
                role="note"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200/90 bg-amber-50/85 px-3.5 py-2.5 text-xs font-medium text-amber-800"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Admin approval is required before Instructor features activate. You can sign in
                  and edit your profile while your application is reviewed.
                </span>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-sm font-medium text-rose-700"
              >
                {error}
              </div>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  id="reg-name"
                  label="Full name (First & Last)"
                  value={name}
                  onChange={setName}
                  onBlur={() => markTouched('name')}
                  error={showErr('name', rawNameErr)}
                  autoComplete="name"
                  required
                  disabled={submitting}
                  maxLength={120}
                  placeholder="Youssef Ahmed"
                />
                <Field
                  id="reg-email"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  onBlur={() => markTouched('email')}
                  error={showErr('email', rawEmailErr)}
                  autoComplete="email"
                  required
                  disabled={submitting}
                  placeholder="you@example.com"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Field
                    id="reg-password"
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    onBlur={() => markTouched('password')}
                    error={showErr('password', rawPasswordErr)}
                    autoComplete="new-password"
                    required
                    disabled={submitting}
                    minLength={8}
                    maxLength={128}
                    placeholder="At least 8 characters"
                  />
                  <PasswordStrengthMeter password={password} />
                </div>
                <Field
                  id="reg-confirm"
                  label="Confirm password"
                  type="password"
                  value={confirm}
                  onChange={setConfirm}
                  onBlur={() => markTouched('confirm')}
                  error={showErr('confirm', rawConfirmErr)}
                  autoComplete="new-password"
                  required
                  disabled={submitting}
                  minLength={8}
                  maxLength={128}
                  placeholder="Repeat password"
                />
              </div>

              {role === 'STUDENT' ? (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field
                      id="reg-school"
                      label="School"
                      value={school}
                      onChange={setSchool}
                      onBlur={() => markTouched('school')}
                      error={showErr('school', rawSchoolErr)}
                      autoComplete="organization"
                      disabled={submitting}
                      maxLength={160}
                      placeholder="British International School"
                    />
                    <Field
                      id="reg-class"
                      label="Class / Grade"
                      value={className}
                      onChange={setClassName}
                      onBlur={() => markTouched('className')}
                      error={showErr('className', rawClassErr)}
                      disabled={submitting}
                      maxLength={60}
                      placeholder="Year 10B"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Field
                      id="reg-telegram"
                      label="Student Telegram ID"
                      value={telegramId}
                      onChange={setTelegramId}
                      onBlur={() => markTouched('telegramId')}
                      error={showErr('telegramId', rawTelegramErr)}
                      hint="Numeric ID from @userinfobot"
                      disabled={submitting}
                      maxLength={20}
                      placeholder="123456789"
                    />
                    <Field
                      id="reg-parent-phone"
                      label="Parent Phone"
                      type="tel"
                      value={parentPhone}
                      onChange={setParentPhone}
                      onBlur={() => markTouched('parentPhone')}
                      error={showErr('parentPhone', rawParentPhoneErr)}
                      autoComplete="tel"
                      disabled={submitting}
                      maxLength={40}
                      placeholder="+2010XXXXXXXX"
                    />
                    <Field
                      id="reg-parent-telegram"
                      label="Parent Telegram ID"
                      value={parentTelegramId}
                      onChange={setParentTelegramId}
                      onBlur={() => markTouched('parentTelegramId')}
                      error={showErr('parentTelegramId', rawParentTelegramErr)}
                      hint="Numeric ID from @userinfobot"
                      disabled={submitting}
                      maxLength={20}
                      placeholder="987654321"
                    />
                  </div>

                  <div className="glass-panel space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-zinc-800">
                          Instructors (Optional — or Self-Study)
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          Selected instructors will receive an enrollment request to approve. Leave
                          empty for Self-Study.
                        </p>
                      </div>
                      <span className="glass-pill">
                        {selectedIds.length === 0 ? 'Self-Study' : `${selectedIds.length} selected`}
                      </span>
                    </div>

                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                        aria-hidden="true"
                      />
                      <label htmlFor="reg-instructor-search" className="sr-only">
                        Search instructors
                      </label>
                      <input
                        id="reg-instructor-search"
                        type="search"
                        value={instructorQuery}
                        onChange={(e) => setInstructorQuery(e.target.value)}
                        disabled={submitting || instructorsLoading}
                        placeholder="Filter instructors by name or school…"
                        className="glass-input !py-2 !pl-9 !text-xs"
                      />
                    </div>

                    {instructorsLoading ? (
                      <div className="flex items-center gap-2 py-3 text-xs text-zinc-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        Loading instructors…
                      </div>
                    ) : instructorsError ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
                        {instructorsError}
                      </p>
                    ) : filteredInstructors.length === 0 ? (
                      <p className="py-2 text-xs text-zinc-500">
                        {instructors.length === 0
                          ? 'No active instructors available yet — you will start in Self-Study mode.'
                          : 'No instructors match your search.'}
                      </p>
                    ) : (
                      <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                        {filteredInstructors.map((inst) => {
                          const checked = selectedIds.includes(inst.id);
                          const inputId = `reg-inst-${inst.id}`;
                          return (
                            <li key={inst.id}>
                              <label
                                htmlFor={inputId}
                                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-xs transition-colors ${
                                  checked
                                    ? 'border-zinc-900/20 bg-white/95 ring-1 ring-zinc-900/10'
                                    : 'border-white/70 bg-white/50 hover:bg-white/80'
                                }`}
                              >
                                <input
                                  id={inputId}
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleInstructor(inst.id)}
                                  disabled={
                                    submitting ||
                                    (!checked && selectedIds.length >= MAX_INSTRUCTORS)
                                  }
                                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900/20"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-semibold text-zinc-900">
                                    {inst.name || 'Unnamed Instructor'}
                                  </span>
                                  {inst.school && (
                                    <span className="block truncate text-[11px] text-zinc-500">
                                      {inst.school}
                                    </span>
                                  )}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Field
                    id="reg-inst-school"
                    label="School / Institution"
                    value={school}
                    onChange={setSchool}
                    onBlur={() => markTouched('school')}
                    error={showErr('school', rawSchoolErr)}
                    autoComplete="organization"
                    disabled={submitting}
                    maxLength={160}
                    placeholder="Cairo Modern Academy"
                  />
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="reg-bio" className="text-xs font-semibold text-zinc-600">
                        Short Bio{' '}
                        <span className="font-normal text-zinc-400">(optional)</span>
                      </label>
                      <span className="text-[11px] text-zinc-400">{bio.length}/1000</span>
                    </div>
                    <textarea
                      id="reg-bio"
                      rows={3}
                      maxLength={1000}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      disabled={submitting}
                      placeholder="Share your subjects, teaching experience, or IGCSE specialization…"
                      className="glass-input resize-y"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={submitting || (attemptedSubmit && Boolean(firstValidationError))}
                className="glass-btn-primary w-full"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                )}
                {submitting
                  ? 'Creating account…'
                  : role === 'INSTRUCTOR'
                    ? 'Continue as Instructor'
                    : 'Create Student Account'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-zinc-600">
              Already have an account?{' '}
              <Link
                href={loginHref}
                className="font-semibold text-zinc-900 underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </PageEntrance>
  );
}

export default function RegisterPage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
