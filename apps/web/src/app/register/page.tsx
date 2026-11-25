'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { GraduationCap, Info, Loader2, Search, UserPlus, Users } from 'lucide-react';
import type { AuthUserView, PublicInstructorView, RegisterRequest } from '@edumenai/shared';
import { useAuth } from '../../components/auth/AuthProvider';
import { getPostLoginPath, sanitizeNextPath } from '../../components/auth/auth-utils';
import { PageEntrance, SlidingTabButton } from '../../components/ui/MotionPrimitives';
import { fetchPublicInstructors } from '../../lib/api';

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
  type = 'text',
  autoComplete,
  required = false,
  disabled = false,
  placeholder,
  maxLength,
  minLength
}: FieldProps): React.ReactElement {
  return (
    <div className="space-y-1.5">
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
        className="glass-input"
      />
    </div>
  );
}

function RegisterForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams.get('next'));
  const { user, isLoading, register } = useAuth();

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

  const [instructors, setInstructors] = useState<PublicInstructorView[]>([]);
  const [instructorsLoading, setInstructorsLoading] = useState<boolean>(true);
  const [instructorsError, setInstructorsError] = useState<string | null>(null);
  const [instructorQuery, setInstructorQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
            err instanceof Error ? err.message : 'Could not load instructors. You can still sign up for Self-Study.'
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
    setError(null);

    if (name.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
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
      const created = await register(payload);
      router.replace(landingPath(created, next));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create your account. Please try again.');
      setSubmitting(false);
    }
  };

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';
  const isStudent = role === 'STUDENT';

  return (
    <PageEntrance className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <div className="glass-panel-strong p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Create your account</h1>
          <p className="mt-1 text-sm text-zinc-600">Join EdumenAI as a student or an instructor.</p>
        </div>

        <div
          role="tablist"
          aria-label="Account type"
          className="mb-6 inline-flex w-full gap-1 rounded-2xl border border-white/90 bg-zinc-900/[0.04] p-1"
        >
          <SlidingTabButton
            asTab
            layoutId="register-role-pill"
            isActive={isStudent}
            onClick={() => setRole('STUDENT')}
            className="flex-1 justify-center"
          >
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            Student
          </SlidingTabButton>
          <SlidingTabButton
            asTab
            layoutId="register-role-pill"
            isActive={!isStudent}
            onClick={() => setRole('INSTRUCTOR')}
            className="flex-1 justify-center"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            Instructor
          </SlidingTabButton>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-sm font-medium text-rose-700"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="register-name"
              label="Name"
              value={name}
              onChange={setName}
              autoComplete="name"
              required
              maxLength={120}
              disabled={submitting}
            />
            <Field
              id="register-email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
              disabled={submitting}
            />
            <Field
              id="register-password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              disabled={submitting}
              placeholder="At least 8 characters"
            />
            <Field
              id="register-confirm"
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              disabled={submitting}
            />
          </div>

          {isStudent ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="register-school"
                  label="School"
                  value={school}
                  onChange={setSchool}
                  autoComplete="organization"
                  maxLength={160}
                  disabled={submitting}
                />
                <Field
                  id="register-class"
                  label="Class / Grade"
                  value={className}
                  onChange={setClassName}
                  maxLength={120}
                  disabled={submitting}
                />
                <Field
                  id="register-telegram"
                  label="Student Telegram ID"
                  value={telegramId}
                  onChange={setTelegramId}
                  autoComplete="off"
                  maxLength={120}
                  disabled={submitting}
                  placeholder="@username"
                />
                <Field
                  id="register-parent-phone"
                  label="Parent Phone"
                  type="tel"
                  value={parentPhone}
                  onChange={setParentPhone}
                  autoComplete="off"
                  maxLength={40}
                  disabled={submitting}
                />
                <Field
                  id="register-parent-telegram"
                  label="Parent Telegram ID"
                  value={parentTelegramId}
                  onChange={setParentTelegramId}
                  autoComplete="off"
                  maxLength={120}
                  disabled={submitting}
                  placeholder="@username"
                />
              </div>

              <fieldset className="space-y-2.5" disabled={submitting}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <legend className="text-xs font-semibold text-zinc-600">
                    Instructors (Optional — or Self-Study)
                  </legend>
                  <span className="glass-pill" aria-live="polite">
                    {selectedIds.length} selected
                  </span>
                </div>

                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                    aria-hidden="true"
                  />
                  <label htmlFor="register-instructor-search" className="sr-only">
                    Search instructors
                  </label>
                  <input
                    id="register-instructor-search"
                    type="search"
                    autoComplete="off"
                    value={instructorQuery}
                    onChange={(e) => setInstructorQuery(e.target.value)}
                    placeholder="Search by name or school"
                    className="glass-input pl-9"
                  />
                </div>

                <div className="glass-panel max-h-56 overflow-y-auto p-1.5">
                  {instructorsLoading ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-sm text-zinc-600">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Loading instructors…
                    </div>
                  ) : instructorsError ? (
                    <p className="px-3 py-4 text-sm text-amber-700">{instructorsError}</p>
                  ) : instructors.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-zinc-600">
                      No instructors available yet — you will start in Self-Study mode.
                    </p>
                  ) : filteredInstructors.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-zinc-600">No instructors match your search.</p>
                  ) : (
                    <ul className="space-y-1">
                      {filteredInstructors.map((inst) => {
                        const checked = selectedIds.includes(inst.id);
                        const inputId = `register-instructor-${inst.id}`;
                        return (
                          <li key={inst.id}>
                            <label
                              htmlFor={inputId}
                              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                                checked ? 'bg-zinc-900/[0.07]' : 'hover:bg-white/80'
                              }`}
                            >
                              <input
                                id={inputId}
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleInstructor(inst.id)}
                                className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-zinc-900">
                                  {inst.name ?? 'Unnamed instructor'}
                                </span>
                                {inst.school && (
                                  <span className="block truncate text-xs text-zinc-600">{inst.school}</span>
                                )}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <p className="text-xs text-zinc-500">
                  Instructors must approve your enrollment request. Leave empty to start in Self-Study.
                </p>
              </fieldset>
            </>
          ) : (
            <>
              <Field
                id="register-institution"
                label="School / Institution"
                value={school}
                onChange={setSchool}
                autoComplete="organization"
                maxLength={160}
                disabled={submitting}
              />
              <div className="space-y-1.5">
                <label htmlFor="register-bio" className="text-xs font-semibold text-zinc-600">
                  Short Bio <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <textarea
                  id="register-bio"
                  rows={4}
                  maxLength={1000}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  disabled={submitting}
                  className="glass-input resize-y"
                  placeholder="Tell students a little about your teaching."
                />
                <p className="text-right text-xs text-zinc-400">{bio.length}/1000</p>
              </div>
              <div
                role="note"
                className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 px-3.5 py-2.5 text-sm font-medium text-amber-800"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Admin approval is required before Instructor features activate.</span>
              </div>
            </>
          )}

          <button type="submit" disabled={submitting} className="glass-btn-primary w-full">
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            )}
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600">
          Already have an account?{' '}
          <Link href={loginHref} className="font-semibold text-zinc-900 underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
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
