'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  GraduationCap,
  Info,
  Loader2,
  Search,
  Send,
  UserMinus,
  X
} from 'lucide-react';
import type { PublicInstructorView } from '@edumenai/shared';
import {
  deleteEnrollment,
  fetchPublicInstructors,
  requestEnrollment
} from '../../lib/api';
import { StaggerCard, StaggerGrid } from '../ui/MotionPrimitives';
import {
  Banner,
  EmptyState,
  Field,
  SectionLoading,
  SectionTitle,
  StatusPill,
  errorMessage,
  formatDate,
  orDash,
  useEnrollments
} from './shared';

export interface StudentInstructorsTabProps {
  onChanged: () => Promise<unknown>;
}

export function StudentInstructorsTab({
  onChanged
}: StudentInstructorsTabProps): React.ReactElement {
  const { items: enrollments, loading: loadingEnrollments, error: enrollmentsError, reload } =
    useEnrollments();

  const [instructors, setInstructors] = useState<PublicInstructorView[]>([]);
  const [loadingInstructors, setLoadingInstructors] = useState<boolean>(true);
  const [instructorsError, setInstructorsError] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [selectedInstructorId, setSelectedInstructorId] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listSuccess, setListSuccess] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingInstructors(true);
    setInstructorsError(null);

    fetchPublicInstructors()
      .then((list) => {
        if (!cancelled) setInstructors(Array.isArray(list) ? list : []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setInstructorsError(errorMessage(err, 'Could not load available instructors.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingInstructors(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const blockedInstructorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of enrollments) {
      if (item.status === 'PENDING' || item.status === 'APPROVED') {
        ids.add(item.instructorId);
      }
    }
    return ids;
  }, [enrollments]);

  const availableInstructors = useMemo(
    () => instructors.filter((inst) => !blockedInstructorIds.has(inst.id)),
    [instructors, blockedInstructorIds]
  );

  const filteredInstructors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableInstructors;
    return availableInstructors.filter((inst) => {
      const haystack = `${inst.name ?? ''} ${inst.school ?? ''} ${inst.bio ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [availableInstructors, search]);

  useEffect(() => {
    if (
      selectedInstructorId &&
      !availableInstructors.some((inst) => inst.id === selectedInstructorId)
    ) {
      setSelectedInstructorId('');
    }
  }, [availableInstructors, selectedInstructorId]);

  const approvedCount = useMemo(
    () => enrollments.filter((item) => item.status === 'APPROVED').length,
    [enrollments]
  );

  const handleRequestSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setRequestSuccess(null);
    setRequestError(null);

    if (!selectedInstructorId) {
      setRequestError('Please select an instructor before sending a request.');
      return;
    }

    const trimmedNote = note.trim();
    if (trimmedNote.length > 300) {
      setRequestError('Note must be 300 characters or fewer.');
      return;
    }

    setSubmitting(true);
    try {
      await requestEnrollment({
        instructorId: selectedInstructorId,
        note: trimmedNote.length > 0 ? trimmedNote : undefined
      });
      setSelectedInstructorId('');
      setNote('');
      setRequestSuccess('Enrollment request sent. Your instructor will review it shortly.');
      await onChanged();
      reload();
    } catch (err: unknown) {
      setRequestError(errorMessage(err, 'Could not send enrollment request.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, isPending: boolean): Promise<void> => {
    setListSuccess(null);
    setListError(null);
    setDeletingId(id);
    try {
      await deleteEnrollment(id);
      setConfirmDeleteId(null);
      setListSuccess(isPending ? 'Enrollment request cancelled.' : 'Instructor removed.');
      await onChanged();
      reload();
    } catch (err: unknown) {
      setListError(errorMessage(err, 'Could not update your instructor connection.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Current instructor enrollments */}
      <section className="glass-panel space-y-4 p-5 sm:p-6" aria-label="My instructors">
        <SectionTitle
          title="My Instructors"
          description="Manage your active instructors and pending enrollment requests."
          right={
            <span className="glass-pill">
              <GraduationCap className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
              {approvedCount > 0
                ? `${approvedCount} active`
                : 'Self-Study (Independent)'}
            </span>
          }
        />

        <div className="flex items-start gap-2.5 rounded-xl border border-white/80 bg-white/55 px-3.5 py-2.5 text-xs text-zinc-600 ring-1 ring-zinc-900/[0.05]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
          <p>
            <span className="font-semibold text-zinc-800">
              Leaving all instructors = Self-Study (Independent).
            </span>{' '}
            You can keep practicing independently at any time or request a new instructor below.
          </p>
        </div>

        {listSuccess ? <Banner kind="success">{listSuccess}</Banner> : null}
        {listError ? <Banner kind="error">{listError}</Banner> : null}
        {enrollmentsError ? <Banner kind="error">{enrollmentsError}</Banner> : null}

        {loadingEnrollments ? (
          <SectionLoading label="Loading your instructors…" />
        ) : enrollments.length === 0 ? (
          <EmptyState>
            You are currently in <span className="font-semibold text-zinc-800">Self-Study (Independent)</span>{' '}
            mode with no active or pending instructor requests.
          </EmptyState>
        ) : (
          <StaggerGrid className="space-y-3">
            {enrollments.map((enrollment) => {
              const isConfirming = confirmDeleteId === enrollment.id;
              const isBusy = deletingId === enrollment.id;
              const isPending = enrollment.status === 'PENDING';
              const actionLabel =
                enrollment.status === 'APPROVED'
                  ? 'Leave'
                  : enrollment.status === 'PENDING'
                    ? 'Cancel request'
                    : 'Remove';

              return (
                <StaggerCard
                  key={enrollment.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-white/80 bg-white/60 p-4 ring-1 ring-zinc-900/[0.05] sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-zinc-900">
                        {orDash(enrollment.instructor?.name)}
                      </p>
                      <StatusPill status={enrollment.status} />
                    </div>
                    <p className="text-xs text-zinc-600">
                      School: {orDash(enrollment.instructor?.school)} · Requested{' '}
                      {formatDate(enrollment.requestedAt)}
                    </p>
                    {enrollment.note ? (
                      <p className="text-xs italic text-zinc-500">&ldquo;{enrollment.note}&rdquo;</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {isConfirming ? (
                      <>
                        <span className="text-xs font-medium text-zinc-600">Are you sure?</span>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                          disabled={isBusy}
                          onClick={() => {
                            void handleDelete(enrollment.id, isPending);
                          }}
                        >
                          {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="glass-btn-secondary px-3 py-1.5 text-xs"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="glass-btn-secondary px-3 py-1.5 text-xs text-rose-700 hover:text-rose-800"
                        disabled={deletingId !== null}
                        onClick={() => {
                          setListError(null);
                          setListSuccess(null);
                          setConfirmDeleteId(enrollment.id);
                        }}
                      >
                        <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                        {actionLabel}
                      </button>
                    )}
                  </div>
                </StaggerCard>
              );
            })}
          </StaggerGrid>
        )}
      </section>

      {/* Request a new instructor */}
      <form
        onSubmit={(event) => {
          void handleRequestSubmit(event);
        }}
        className="glass-panel space-y-4 p-5 sm:p-6"
        noValidate
      >
        <SectionTitle
          title="Request an instructor"
          description="Search active instructors and send a connection request with an optional message."
        />

        {requestSuccess ? <Banner kind="success">{requestSuccess}</Banner> : null}
        {requestError ? <Banner kind="error">{requestError}</Banner> : null}
        {instructorsError ? <Banner kind="error">{instructorsError}</Banner> : null}

        {loadingInstructors ? (
          <SectionLoading label="Loading available instructors…" />
        ) : availableInstructors.length === 0 ? (
          <EmptyState>
            No additional instructors are available to request right now.
          </EmptyState>
        ) : (
          <>
            <Field id="instructor-search" label="Find an instructor">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                />
                <input
                  id="instructor-search"
                  type="search"
                  className="glass-input pl-10"
                  placeholder="Search by instructor name, school, or bio…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </Field>

            <div
              role="listbox"
              aria-label="Available instructors"
              className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-zinc-200/70 bg-white/45 p-2"
            >
              {filteredInstructors.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-zinc-500">
                  No instructors match &ldquo;{search.trim()}&rdquo;.
                </p>
              ) : (
                filteredInstructors.map((inst) => {
                  const isSelected = selectedInstructorId === inst.id;
                  return (
                    <button
                      key={inst.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setSelectedInstructorId(inst.id);
                        setRequestError(null);
                      }}
                      className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${
                        isSelected
                          ? 'border-zinc-900 bg-zinc-900 text-white shadow-sm'
                          : 'border-white/80 bg-white/75 text-zinc-900 hover:bg-white'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{orDash(inst.name)}</p>
                        <p
                          className={`truncate text-xs ${
                            isSelected ? 'text-zinc-300' : 'text-zinc-500'
                          }`}
                        >
                          {orDash(inst.school)}
                        </p>
                        {inst.bio ? (
                          <p
                            className={`mt-1 line-clamp-2 text-xs ${
                              isSelected ? 'text-zinc-200' : 'text-zinc-600'
                            }`}
                          >
                            {inst.bio}
                          </p>
                        ) : null}
                      </div>
                      {isSelected ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>

            <Field
              id="enrollment-note"
              label="Optional note"
              hint={`${note.length}/300 characters`}
            >
              <textarea
                id="enrollment-note"
                className="glass-input min-h-[5.5rem] resize-y"
                maxLength={300}
                placeholder="Introduce yourself or mention your class / schedule…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>

            <div className="flex justify-end">
              <button
                type="submit"
                className="glass-btn-primary"
                disabled={submitting || !selectedInstructorId}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                {submitting ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
