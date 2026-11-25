'use client';

import React, { useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Loader2,
  UserCheck,
  UserMinus,
  Users,
  X
} from 'lucide-react';
import type { AccountStatus } from '@edumenai/shared';
import { deleteEnrollment, respondToEnrollment } from '../../lib/api';
import { StaggerCard, StaggerGrid } from '../ui/MotionPrimitives';
import {
  Banner,
  EmptyState,
  SectionLoading,
  SectionTitle,
  StatusPill,
  errorMessage,
  formatDate,
  orDash,
  useEnrollments
} from './shared';

export interface InstructorStudentsTabProps {
  accountStatus: AccountStatus;
  onChanged: () => Promise<unknown>;
}

export function InstructorStudentsTab({
  accountStatus,
  onChanged
}: InstructorStudentsTabProps): React.ReactElement {
  const { items: enrollments, loading, error, reload } = useEnrollments();

  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const pendingRequests = useMemo(
    () => enrollments.filter((item) => item.status === 'PENDING'),
    [enrollments]
  );

  const approvedStudents = useMemo(
    () => enrollments.filter((item) => item.status === 'APPROVED'),
    [enrollments]
  );

  const isActive = accountStatus === 'ACTIVE';

  const handleRespond = async (
    id: string,
    status: 'APPROVED' | 'REJECTED'
  ): Promise<void> => {
    setActionSuccess(null);
    setActionError(null);
    setRespondingId(id);
    try {
      await respondToEnrollment(id, { status });
      setActionSuccess(
        status === 'APPROVED'
          ? 'Student approved and added to your roster.'
          : 'Enrollment request rejected.'
      );
      await onChanged();
      reload();
    } catch (err: unknown) {
      setActionError(errorMessage(err, 'Could not respond to the enrollment request.'));
    } finally {
      setRespondingId(null);
    }
  };

  const handleRemove = async (id: string): Promise<void> => {
    setActionSuccess(null);
    setActionError(null);
    setRemovingId(id);
    try {
      await deleteEnrollment(id);
      setConfirmRemoveId(null);
      setActionSuccess('Student removed from your roster.');
      await onChanged();
      reload();
    } catch (err: unknown) {
      setActionError(errorMessage(err, 'Could not remove student from your roster.'));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {!isActive ? (
        <Banner kind="warning">
          <p className="font-semibold">Student management unlocks after approval</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-800/90">
            Your instructor account is currently{' '}
            <span className="font-semibold">
              {accountStatus === 'PENDING_APPROVAL' ? 'pending admin approval' : 'suspended'}
            </span>
            . Once activated, students can find you and request to join your roster.
          </p>
        </Banner>
      ) : null}

      {actionSuccess ? <Banner kind="success">{actionSuccess}</Banner> : null}
      {actionError ? <Banner kind="error">{actionError}</Banner> : null}
      {error ? <Banner kind="error">{error}</Banner> : null}

      {/* Pending Requests queue */}
      <section className="glass-panel space-y-4 p-5 sm:p-6" aria-label="Pending enrollment requests">
        <SectionTitle
          title="Pending Requests"
          description="Review students who have requested to connect with you."
          right={
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50/90 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-600/20">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {pendingRequests.length} pending
            </span>
          }
        />

        {loading ? (
          <SectionLoading label="Loading pending requests…" />
        ) : pendingRequests.length === 0 ? (
          <EmptyState>No pending student requests right now.</EmptyState>
        ) : (
          <StaggerGrid className="space-y-3">
            {pendingRequests.map((req) => {
              const isBusy = respondingId === req.id;
              return (
                <StaggerCard
                  key={req.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-white/80 bg-white/60 p-4 ring-1 ring-zinc-900/[0.05] sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-zinc-900">
                        {orDash(req.student?.name)}
                      </p>
                      <StatusPill status={req.status} />
                    </div>
                    <p className="text-xs text-zinc-600">
                      School: {orDash(req.student?.school)} · Class:{' '}
                      {orDash(req.student?.className)} · Requested {formatDate(req.requestedAt)}
                    </p>
                    {req.note ? (
                      <p className="text-xs italic text-zinc-500">&ldquo;{req.note}&rdquo;</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="glass-btn-primary px-3.5 py-2 text-xs"
                      disabled={isBusy || respondingId !== null}
                      onClick={() => {
                        void handleRespond(req.id, 'APPROVED');
                      }}
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Approve
                    </button>
                    <button
                      type="button"
                      className="glass-btn-secondary px-3.5 py-2 text-xs text-rose-700 hover:text-rose-800"
                      disabled={isBusy || respondingId !== null}
                      onClick={() => {
                        void handleRespond(req.id, 'REJECTED');
                      }}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Reject
                    </button>
                  </div>
                </StaggerCard>
              );
            })}
          </StaggerGrid>
        )}
      </section>

      {/* Approved Student Roster */}
      <section className="glass-panel space-y-4 p-5 sm:p-6" aria-label="Approved student roster">
        <SectionTitle
          title="Approved Student Roster"
          description="Contact and classroom information for your active students."
          right={
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50/90 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {approvedStudents.length} active
            </span>
          }
        />

        {loading ? (
          <SectionLoading label="Loading approved student roster…" />
        ) : approvedStudents.length === 0 ? (
          <EmptyState>You do not have any approved students yet.</EmptyState>
        ) : (
          <>
            {/* Desktop glass table */}
            <div className="hidden overflow-x-auto rounded-xl border border-white/80 bg-white/55 ring-1 ring-zinc-900/[0.05] md:block">
              <table className="min-w-full divide-y divide-zinc-200/70 text-left text-sm">
                <thead className="bg-white/60 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Student Name
                    </th>
                    <th scope="col" className="px-4 py-3">
                      School
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Class
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Telegram ID
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Parent Phone
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Parent Telegram ID
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60">
                  {approvedStudents.map((item) => {
                    const isConfirming = confirmRemoveId === item.id;
                    const isBusy = removingId === item.id;
                    return (
                      <tr key={item.id} className="transition-colors hover:bg-white/65">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-zinc-900">{orDash(item.student?.name)}</p>
                          {item.student?.email ? (
                            <p className="text-xs text-zinc-500">{item.student.email}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-zinc-700">{orDash(item.student?.school)}</td>
                        <td className="px-4 py-3 text-zinc-700">
                          {orDash(item.student?.className)}
                        </td>
                        <td className="px-4 py-3 text-zinc-700">
                          {orDash(item.student?.telegramId)}
                        </td>
                        <td className="px-4 py-3 text-zinc-700">
                          {orDash(item.student?.parentPhone)}
                        </td>
                        <td className="px-4 py-3 text-zinc-700">
                          {orDash(item.student?.parentTelegramId)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isConfirming ? (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                                disabled={isBusy}
                                onClick={() => {
                                  void handleRemove(item.id);
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
                                className="glass-btn-secondary px-2.5 py-1.5 text-xs"
                                disabled={isBusy}
                                onClick={() => setConfirmRemoveId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="glass-btn-secondary px-3 py-1.5 text-xs text-rose-700 hover:text-rose-800"
                              disabled={removingId !== null}
                              onClick={() => {
                                setActionError(null);
                                setActionSuccess(null);
                                setConfirmRemoveId(item.id);
                              }}
                            >
                              <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile glass cards */}
            <StaggerGrid className="space-y-3 md:hidden">
              {approvedStudents.map((item) => {
                const isConfirming = confirmRemoveId === item.id;
                const isBusy = removingId === item.id;
                return (
                  <StaggerCard
                    key={item.id}
                    className="space-y-3 rounded-xl border border-white/80 bg-white/60 p-4 ring-1 ring-zinc-900/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900">
                          {orDash(item.student?.name)}
                        </p>
                        {item.student?.email ? (
                          <p className="truncate text-xs text-zinc-500">{item.student.email}</p>
                        ) : null}
                      </div>
                      <StatusPill status={item.status} />
                    </div>

                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-zinc-400">
                          School
                        </dt>
                        <dd className="text-zinc-700">{orDash(item.student?.school)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-zinc-400">
                          Class
                        </dt>
                        <dd className="text-zinc-700">{orDash(item.student?.className)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-zinc-400">
                          Telegram ID
                        </dt>
                        <dd className="text-zinc-700">{orDash(item.student?.telegramId)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold uppercase tracking-wide text-zinc-400">
                          Parent Phone
                        </dt>
                        <dd className="text-zinc-700">{orDash(item.student?.parentPhone)}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="font-semibold uppercase tracking-wide text-zinc-400">
                          Parent Telegram ID
                        </dt>
                        <dd className="text-zinc-700">{orDash(item.student?.parentTelegramId)}</dd>
                      </div>
                    </dl>

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200/60 pt-3">
                      {isConfirming ? (
                        <>
                          <span className="text-xs font-medium text-zinc-600">Remove student?</span>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                            disabled={isBusy}
                            onClick={() => {
                              void handleRemove(item.id);
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
                            onClick={() => setConfirmRemoveId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="glass-btn-secondary px-3 py-1.5 text-xs text-rose-700 hover:text-rose-800"
                          disabled={removingId !== null}
                          onClick={() => {
                            setActionError(null);
                            setActionSuccess(null);
                            setConfirmRemoveId(item.id);
                          }}
                        >
                          <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                          Remove
                        </button>
                      )}
                    </div>
                  </StaggerCard>
                );
              })}
            </StaggerGrid>
          </>
        )}
      </section>
    </div>
  );
}
