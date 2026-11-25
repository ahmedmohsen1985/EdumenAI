'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Ban,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Copy,
  KeyRound,
  Loader2,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import type {
  AccountStatus,
  AdminUserView,
  CreateUserAdminRequest,
  UserRole
} from '@edumenai/shared';
import {
  ApiError,
  adjustAdminUserCredits,
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  generateAdminUserResetLink,
  updateAdminUser,
  type AdminUsersQuery
} from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import {
  AnimatedModal,
  PageEntrance,
  SlidingTabButton,
  StaggerCard,
  StaggerGrid
} from '../ui/MotionPrimitives';

type FilterTab = 'ALL' | 'PENDING' | 'INSTRUCTOR' | 'STUDENT' | 'ADMIN';

const PAGE_SIZE = 25;

const ROLE_OPTIONS: ReadonlyArray<{ value: UserRole; label: string }> = [
  { value: 'STUDENT', label: 'Student' },
  { value: 'INSTRUCTOR', label: 'Instructor' },
  { value: 'ADMIN', label: 'Admin' }
];

const STATUS_OPTIONS: ReadonlyArray<{ value: AccountStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { value: 'SUSPENDED', label: 'Suspended' }
];

interface ResetLinkState {
  url: string;
  expiresAt: string;
  copied: boolean;
}

interface CreateUserFormState {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  accountStatus: AccountStatus;
  school: string;
  className: string;
  telegramId: string;
  parentPhone: string;
  parentTelegramId: string;
  bio: string;
}

const INITIAL_CREATE_FORM: CreateUserFormState = {
  name: '',
  email: '',
  password: '',
  role: 'STUDENT',
  accountStatus: 'ACTIVE',
  school: '',
  className: '',
  telegramId: '',
  parentPhone: '',
  parentTelegramId: '',
  bio: ''
};

function formatRoleLabel(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'INSTRUCTOR':
      return 'Instructor';
    case 'STUDENT':
      return 'Student';
  }
}

function formatStatusLabel(status: AccountStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'PENDING_APPROVAL':
      return 'Pending Approval';
    case 'SUSPENDED':
      return 'Suspended';
  }
}

function statusPillClasses(status: AccountStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200/90 bg-emerald-50/85 px-2.5 py-0.5 text-xs font-semibold text-emerald-800';
    case 'PENDING_APPROVAL':
      return 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-amber-200/90 bg-amber-50/85 px-2.5 py-0.5 text-xs font-semibold text-amber-800';
    case 'SUSPENDED':
      return 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-rose-200/90 bg-rose-50/85 px-2.5 py-0.5 text-xs font-semibold text-rose-800';
  }
}

function formatError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

function formatExpiry(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function resolveResetUrl(rawUrl: string): string {
  if (rawUrl.startsWith('/') && typeof window !== 'undefined') {
    return `${window.location.origin}${rawUrl}`;
  }
  return rawUrl;
}

function buildQuery(tab: FilterTab, search: string, offset: number): AdminUsersQuery {
  const query: AdminUsersQuery = {
    limit: PAGE_SIZE,
    offset
  };
  if (tab === 'PENDING') {
    query.accountStatus = 'PENDING_APPROVAL';
  } else if (tab === 'INSTRUCTOR' || tab === 'STUDENT' || tab === 'ADMIN') {
    query.role = tab;
  }
  const trimmed = search.trim();
  if (trimmed) {
    query.search = trimmed;
  }
  return query;
}

export function AdminUsersManager(): React.ReactElement {
  const { user: currentUser, refreshAuth } = useAuth();
  const currentUserId = currentUser?.id ?? null;

  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [offset, setOffset] = useState<number>(0);

  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [busyByUserId, setBusyByUserId] = useState<Record<string, string>>({});
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [resetLinksByUserId, setResetLinksByUserId] = useState<Record<string, ResetLinkState>>({});

  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState<CreateUserFormState>(INITIAL_CREATE_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  // Adjust / Top-Up Credits modal
  const [creditModalUser, setCreditModalUser] = useState<AdminUserView | null>(null);
  const [creditType, setCreditType] = useState<'TOP_UP' | 'ADJUSTMENT' | 'REFUND'>('TOP_UP');
  const [creditAmountInput, setCreditAmountInput] = useState<string>('50');
  const [creditNoteInput, setCreditNoteInput] = useState<string>('');
  const [creditModalError, setCreditModalError] = useState<string | null>(null);
  const [isAdjustingCredits, setIsAdjustingCredits] = useState<boolean>(false);

  const openCreditModal = (u: AdminUserView): void => {
    setCreditModalUser(u);
    setCreditType('TOP_UP');
    setCreditAmountInput('50');
    setCreditNoteInput('');
    setCreditModalError(null);
  };

  const handleAdjustCreditsSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!creditModalUser) return;
    const parsedAmount = Number.parseInt(creditAmountInput, 10);
    const trimmedNote = creditNoteInput.trim();
    if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
      setCreditModalError('Enter a non-zero integer credit amount.');
      return;
    }
    if ((creditType === 'TOP_UP' || creditType === 'REFUND') && parsedAmount < 0) {
      setCreditModalError('Top-Up and Refund amounts must be positive. Use Adjustment for deductions.');
      return;
    }
    if (trimmedNote.length < 2) {
      setCreditModalError('Please enter a short reason/note (at least 2 characters).');
      return;
    }

    setIsAdjustingCredits(true);
    setCreditModalError(null);
    try {
      await adjustAdminUserCredits(creditModalUser.id, {
        type: creditType,
        amount: parsedAmount,
        note: trimmedNote
      });
      setCreditModalUser(null);
      await loadData({ silent: true });
      if (creditModalUser.id === currentUserId) {
        void refreshAuth();
      }
    } catch (err: unknown) {
      setCreditModalError(
        err instanceof ApiError ? err.message : 'Failed to adjust user credits.'
      );
    } finally {
      setIsAdjustingCredits(false);
    }
  };

  // Debounce search input
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [searchInput]);

  const loadData = useCallback(
    async (options?: { silent?: boolean }): Promise<void> => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const query = buildQuery(activeTab, debouncedSearch, offset);
        const [listRes, pendingRes] = await Promise.all([
          fetchAdminUsers(query),
          fetchAdminUsers({ accountStatus: 'PENDING_APPROVAL', limit: 1, offset: 0 })
        ]);
        setUsers(listRes.items);
        setTotal(listRes.total);
        setPendingCount(pendingRes.total);
      } catch (err: unknown) {
        setErrorMessage(formatError(err, 'Failed to load users.'));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeTab, debouncedSearch, offset]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const setUserBusy = (userId: string, action: string | null): void => {
    setBusyByUserId((prev) => {
      if (action === null) {
        const next = { ...prev };
        delete next[userId];
        return next;
      }
      return { ...prev, [userId]: action };
    });
  };

  const handleTabChange = (nextTab: FilterTab): void => {
    setActiveTab(nextTab);
    setOffset(0);
    setConfirmDeleteUserId(null);
  };

  const handleApproveUser = async (target: AdminUserView): Promise<void> => {
    setErrorMessage(null);
    setUserBusy(target.id, 'approve');
    try {
      await updateAdminUser(target.id, { accountStatus: 'ACTIVE' });
      await loadData({ silent: true });
      void refreshAuth();
    } catch (err: unknown) {
      setErrorMessage(formatError(err, 'Failed to approve user.'));
    } finally {
      setUserBusy(target.id, null);
    }
  };

  const handleToggleStatus = async (target: AdminUserView): Promise<void> => {
    if (target.id === currentUserId) return;
    const nextStatus: AccountStatus = target.accountStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    setErrorMessage(null);
    setUserBusy(target.id, 'status');
    try {
      await updateAdminUser(target.id, { accountStatus: nextStatus });
      await loadData({ silent: true });
      void refreshAuth();
    } catch (err: unknown) {
      setErrorMessage(formatError(err, 'Failed to update account status.'));
    } finally {
      setUserBusy(target.id, null);
    }
  };

  const handleChangeRole = async (target: AdminUserView, nextRole: UserRole): Promise<void> => {
    if (target.id === currentUserId || target.role === nextRole) return;
    setErrorMessage(null);
    setUserBusy(target.id, 'role');
    try {
      await updateAdminUser(target.id, { role: nextRole });
      await loadData({ silent: true });
      void refreshAuth();
    } catch (err: unknown) {
      setErrorMessage(formatError(err, 'Failed to update user role.'));
    } finally {
      setUserBusy(target.id, null);
    }
  };

  const handleGenerateResetLink = async (target: AdminUserView): Promise<void> => {
    setErrorMessage(null);
    setUserBusy(target.id, 'reset');
    try {
      const result = await generateAdminUserResetLink(target.id);
      setResetLinksByUserId((prev) => ({
        ...prev,
        [target.id]: {
          url: resolveResetUrl(result.resetUrl),
          expiresAt: result.expiresAt,
          copied: false
        }
      }));
    } catch (err: unknown) {
      setErrorMessage(formatError(err, 'Failed to generate password reset link.'));
    } finally {
      setUserBusy(target.id, null);
    }
  };

  const handleCopyResetLink = async (userId: string): Promise<void> => {
    const entry = resetLinksByUserId[userId];
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(entry.url);
      setResetLinksByUserId((prev) => {
        const current = prev[userId];
        if (!current) return prev;
        return { ...prev, [userId]: { ...current, copied: true } };
      });
      window.setTimeout(() => {
        setResetLinksByUserId((prev) => {
          const current = prev[userId];
          if (!current) return prev;
          return { ...prev, [userId]: { ...current, copied: false } };
        });
      }, 2500);
    } catch {
      setErrorMessage('Could not copy reset link to clipboard. Please select and copy it manually.');
    }
  };

  const handleDismissResetLink = (userId: string): void => {
    setResetLinksByUserId((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const handleDeleteUser = async (target: AdminUserView): Promise<void> => {
    if (target.id === currentUserId) return;
    setErrorMessage(null);
    setUserBusy(target.id, 'delete');
    try {
      await deleteAdminUser(target.id);
      setConfirmDeleteUserId(null);
      handleDismissResetLink(target.id);
      // If we just deleted the last item on a non-first page, step back one page
      if (users.length === 1 && offset >= PAGE_SIZE) {
        setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
      } else {
        await loadData({ silent: true });
      }
      void refreshAuth();
    } catch (err: unknown) {
      setErrorMessage(formatError(err, 'Failed to delete user.'));
    } finally {
      setUserBusy(target.id, null);
    }
  };

  const handleOpenCreateModal = (): void => {
    setCreateForm(INITIAL_CREATE_FORM);
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCloseCreateModal = (): void => {
    if (isCreating) return;
    setIsCreateOpen(false);
    setCreateError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setCreateError(null);

    const name = createForm.name.trim();
    const email = createForm.email.trim().toLowerCase();
    const password = createForm.password;

    if (name.length < 2) {
      setCreateError('Full name must be at least 2 characters.');
      return;
    }
    if (!email) {
      setCreateError('Email address is required.');
      return;
    }
    if (password.length < 8) {
      setCreateError('Password must be at least 8 characters.');
      return;
    }

    const payload: CreateUserAdminRequest = {
      name,
      email,
      password,
      role: createForm.role,
      accountStatus: createForm.accountStatus,
      school: createForm.school.trim() || undefined,
      className: createForm.className.trim() || undefined,
      telegramId: createForm.telegramId.trim() || undefined,
      parentPhone: createForm.parentPhone.trim() || undefined,
      parentTelegramId: createForm.parentTelegramId.trim() || undefined,
      bio: createForm.bio.trim() || undefined
    };

    setIsCreating(true);
    try {
      await createAdminUser(payload);
      setIsCreateOpen(false);
      setCreateForm(INITIAL_CREATE_FORM);
      setOffset(0);
      await loadData({ silent: true });
      void refreshAuth();
    } catch (err: unknown) {
      setCreateError(formatError(err, 'Failed to create user.'));
    } finally {
      setIsCreating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + users.length, total);

  const filterTabs: ReadonlyArray<{ id: FilterTab; label: string; count?: number }> = [
    { id: 'ALL', label: 'All' },
    { id: 'PENDING', label: 'Pending Approvals', count: pendingCount },
    { id: 'INSTRUCTOR', label: 'Instructors' },
    { id: 'STUDENT', label: 'Students' },
    { id: 'ADMIN', label: 'Admins' }
  ];

  const renderContactSummary = (u: AdminUserView): React.ReactElement => {
    const hasAny = Boolean(u.telegramId || u.parentPhone || u.parentTelegramId);
    if (!hasAny) {
      return <span className="text-xs text-zinc-400">No contact info</span>;
    }
    return (
      <div className="space-y-1 text-xs text-zinc-700">
        {u.telegramId && (
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span className="truncate font-medium">Student: {u.telegramId}</span>
          </div>
        )}
        {u.parentPhone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span className="truncate">Parent: {u.parentPhone}</span>
          </div>
        )}
        {u.parentTelegramId && (
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span className="truncate">Parent TG: {u.parentTelegramId}</span>
          </div>
        )}
      </div>
    );
  };

  const renderActivitySummary = (u: AdminUserView): React.ReactElement => (
    <div className="flex flex-wrap gap-1.5">
      <span className="glass-pill tabular-nums">
        <Coins className="h-3 w-3 text-zinc-500" />
        {u.creditBalance} cr
      </span>
      {u.role === 'INSTRUCTOR' ? (
        <span className="glass-pill">
          {u.instructorStudentCount} {u.instructorStudentCount === 1 ? 'student' : 'students'}
        </span>
      ) : (
        <span className="glass-pill">
          {u.studentEnrollmentCount}{' '}
          {u.studentEnrollmentCount === 1 ? 'enrollment' : 'enrollments'}
        </span>
      )}
      <span className="glass-pill">
        {u.submissionCount} {u.submissionCount === 1 ? 'submission' : 'submissions'}
      </span>
    </div>
  );

  const renderResetLinkBox = (userId: string): React.ReactElement | null => {
    const entry = resetLinksByUserId[userId];
    if (!entry) return null;

    return (
      <div className="mt-3 rounded-xl border border-zinc-200/90 bg-white/80 p-3 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
            <KeyRound className="h-3.5 w-3.5 text-zinc-600" />
            <span>Password Reset Link</span>
            <span className="font-normal text-zinc-500">
              · Expires {formatExpiry(entry.expiresAt)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleDismissResetLink(userId)}
            aria-label="Dismiss reset link"
            className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            readOnly
            value={entry.url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Generated password reset URL"
            className="glass-input !py-1.5 font-mono !text-xs"
          />
          <button
            type="button"
            onClick={() => void handleCopyResetLink(userId)}
            className="glass-btn-secondary !rounded-xl !px-3 !py-1.5 !text-xs"
          >
            {entry.copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderRowActions = (u: AdminUserView): React.ReactElement => {
    const busyAction = busyByUserId[u.id] ?? null;
    const isBusy = busyAction !== null;
    const isSelf = currentUserId !== null && u.id === currentUserId;
    const isConfirmingDelete = confirmDeleteUserId === u.id;

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {u.accountStatus === 'PENDING_APPROVAL' && (
          <button
            type="button"
            onClick={() => void handleApproveUser(u)}
            disabled={isBusy}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border border-emerald-200/90 bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyAction === 'approve' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserCheck className="h-3.5 w-3.5" />
            )}
            <span>Approve</span>
          </button>
        )}

        {u.accountStatus !== 'PENDING_APPROVAL' && (
          <button
            type="button"
            onClick={() => void handleToggleStatus(u)}
            disabled={isBusy || isSelf}
            title={
              isSelf
                ? 'You cannot change your own account status'
                : u.accountStatus === 'SUSPENDED'
                  ? 'Activate user account'
                  : 'Suspend user account'
            }
            className="glass-btn-secondary !rounded-xl !px-2.5 !py-1.5 !text-xs"
          >
            {busyAction === 'status' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : u.accountStatus === 'SUSPENDED' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Ban className="h-3.5 w-3.5 text-rose-600" />
            )}
            <span>{u.accountStatus === 'SUSPENDED' ? 'Activate' : 'Suspend'}</span>
          </button>
        )}

        <select
          aria-label={`Role for ${u.name || u.email || 'user'}`}
          value={u.role}
          disabled={isBusy || isSelf}
          title={isSelf ? 'You cannot change your own role' : 'Change user role'}
          onChange={(e) => void handleChangeRole(u, e.target.value as UserRole)}
          className="glass-input !w-auto !rounded-xl !py-1.5 !pl-2.5 !pr-7 !text-xs font-semibold"
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => openCreditModal(u)}
          disabled={isBusy}
          title="Adjust / Top-Up Credits"
          aria-label={`Adjust credits for ${u.name || u.email || 'user'}`}
          className="glass-btn-secondary !rounded-xl !p-2"
        >
          <Coins className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => void handleGenerateResetLink(u)}
          disabled={isBusy}
          title="Generate one-time password reset link"
          className="glass-btn-secondary !rounded-xl !px-2.5 !py-1.5 !text-xs"
        >
          {busyAction === 'reset' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <KeyRound className="h-3.5 w-3.5" />
          )}
          <span>Reset Link</span>
        </button>

        {isConfirmingDelete ? (
          <div className="inline-flex items-center gap-1 rounded-xl border border-rose-200/90 bg-rose-50/90 px-2 py-1">
            <button
              type="button"
              onClick={() => void handleDeleteUser(u)}
              disabled={isBusy}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-rose-600 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
            >
              {busyAction === 'delete' && <Loader2 className="h-3 w-3 animate-spin" />}
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteUserId(null)}
              disabled={isBusy}
              className="whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold text-zinc-700 transition-colors hover:bg-white/80"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDeleteUserId(u.id)}
            disabled={isBusy || isSelf}
            title={isSelf ? 'You cannot delete yourself' : 'Delete user'}
            aria-label={isSelf ? 'You cannot delete yourself' : `Delete ${u.name || u.email || 'user'}`}
            className="glass-btn-secondary !rounded-xl !px-2.5 !py-1.5 !text-xs text-rose-700 hover:border-rose-200 hover:bg-rose-50/80"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only">Delete</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <PageEntrance className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="glass-pill">
            <Users className="h-3.5 w-3.5 text-zinc-600" />
            User Directory &amp; RBAC
          </span>
          <h1 className="mt-2.5 text-2xl font-bold tracking-tight text-zinc-900">
            Users &amp; Approvals
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Approve instructor applications, provision accounts, manage roles, and issue password
            reset links.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData({ silent: true })}
            disabled={isLoading || isRefreshing}
            className="glass-btn-secondary"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button type="button" onClick={handleOpenCreateModal} className="glass-btn-primary">
            <Plus className="h-4 w-4" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs + Search Bar */}
      <div className="glass-panel flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Filter users by role or approval status"
          className="flex flex-wrap items-center gap-1"
        >
          {filterTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <SlidingTabButton
                key={tab.id}
                layoutId="admin-users-filter-pill"
                asTab
                isActive={isActive}
                onClick={() => handleTabChange(tab.id)}
                className="px-3 py-1.5 text-xs sm:text-sm"
              >
                <span>{tab.label}</span>
                {tab.id === 'PENDING' && typeof tab.count === 'number' && tab.count > 0 && (
                  <span
                    className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
                      isActive
                        ? 'bg-amber-400 text-zinc-950'
                        : 'border border-amber-200/90 bg-amber-100/90 text-amber-900'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </SlidingTabButton>
            );
          })}
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email, school..."
            aria-label="Search users"
            className="glass-input !pl-10 !pr-9"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="glass-panel-strong flex items-start justify-between gap-3 border-rose-200/80 bg-rose-50/75 px-4 py-3.5 text-rose-900"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <p className="text-sm font-medium">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            aria-label="Dismiss error"
            className="rounded-lg p-1 text-rose-600 hover:bg-rose-100/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Loading / Empty / Content */}
      {isLoading ? (
        <div className="glass-panel flex items-center justify-center gap-3 p-12">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">Loading users...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="glass-panel border-dashed border-zinc-300/80 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900/5 text-zinc-500">
            <Users className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-bold text-zinc-900">
            {activeTab === 'PENDING'
              ? 'No pending approvals'
              : debouncedSearch
                ? 'No users match your search'
                : 'No users found'}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {activeTab === 'PENDING'
              ? 'All instructor registration requests have been reviewed.'
              : debouncedSearch
                ? 'Try clearing your search query or switching to a different filter.'
                : 'Provision the first user account to get started.'}
          </p>
          {(debouncedSearch || activeTab !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setDebouncedSearch('');
                setActiveTab('ALL');
                setOffset(0);
              }}
              className="glass-btn-secondary mt-5"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Responsive Glass Table */}
          <div className="glass-panel hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200/75 bg-white/55 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    <th className="px-5 py-3.5">User</th>
                    <th className="px-4 py-3.5">Role &amp; Status</th>
                    <th className="px-4 py-3.5">School / Class</th>
                    <th className="px-4 py-3.5">Contacts</th>
                    <th className="px-4 py-3.5">Activity</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/60">
                  {users.map((u) => {
                    const isSelf = currentUserId !== null && u.id === currentUserId;
                    const hasResetBox = Boolean(resetLinksByUserId[u.id]);

                    return (
                      <React.Fragment key={u.id}>
                        <tr className="transition-colors hover:bg-white/60">
                          <td className="px-5 py-4 align-top">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-900">
                                {u.name || 'Unnamed User'}
                              </span>
                              {isSelf && (
                                <span className="glass-pill !bg-zinc-900 !text-white !border-zinc-900">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-zinc-500">
                              {u.email || 'No email'}
                            </div>
                          </td>

                          <td className="px-4 py-4 align-top">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="glass-pill">{formatRoleLabel(u.role)}</span>
                              <span className={statusPillClasses(u.accountStatus)}>
                                {formatStatusLabel(u.accountStatus)}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-4 align-top">
                            {u.school || u.className ? (
                              <div className="space-y-0.5 text-xs">
                                {u.school && (
                                  <div className="flex items-center gap-1.5 font-medium text-zinc-800">
                                    <Building2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                                    <span>{u.school}</span>
                                  </div>
                                )}
                                {u.className && (
                                  <div className="text-zinc-500">Class: {u.className}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-zinc-400">—</span>
                            )}
                          </td>

                          <td className="max-w-[220px] px-4 py-4 align-top">
                            {renderContactSummary(u)}
                          </td>

                          <td className="px-4 py-4 align-top">{renderActivitySummary(u)}</td>

                          <td className="px-5 py-4 align-top">
                            <div className="flex justify-end">{renderRowActions(u)}</div>
                          </td>
                        </tr>
                        {hasResetBox && (
                          <tr className="bg-zinc-50/70">
                            <td colSpan={6} className="px-5 pb-4 pt-1">
                              {renderResetLinkBox(u.id)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card Layout */}
          <StaggerGrid className="grid gap-3 lg:hidden">
            {users.map((u) => {
              const isSelf = currentUserId !== null && u.id === currentUserId;
              return (
                <StaggerCard key={u.id} className="glass-panel space-y-3.5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-sm font-bold text-zinc-900">
                          {u.name || 'Unnamed User'}
                        </h2>
                        {isSelf && (
                          <span className="glass-pill !bg-zinc-900 !text-white !border-zinc-900">
                            You
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-zinc-500">{u.email || 'No email'}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="glass-pill">{formatRoleLabel(u.role)}</span>
                      <span className={statusPillClasses(u.accountStatus)}>
                        {formatStatusLabel(u.accountStatus)}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-2.5 rounded-xl border border-zinc-200/70 bg-white/55 p-3 text-xs sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                        School / Class
                      </div>
                      <div className="mt-1 text-zinc-700">
                        {u.school || u.className
                          ? [u.school, u.className ? `Class ${u.className}` : null]
                              .filter(Boolean)
                              .join(' · ')
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                        Contacts
                      </div>
                      <div className="mt-1">{renderContactSummary(u)}</div>
                    </div>
                  </div>

                  <div>{renderActivitySummary(u)}</div>

                  <div className="border-t border-zinc-200/70 pt-3">{renderRowActions(u)}</div>

                  {renderResetLinkBox(u.id)}
                </StaggerCard>
              );
            })}
          </StaggerGrid>

          {/* Pagination Footer */}
          <div className="glass-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-zinc-600">
            <div>
              Showing <span className="font-semibold text-zinc-900">{rangeStart}</span>–
              <span className="font-semibold text-zinc-900">{rangeEnd}</span> of{' '}
              <span className="font-semibold text-zinc-900">{total}</span>{' '}
              {total === 1 ? 'user' : 'users'}
            </div>

            <div className="flex items-center gap-2">
              <span className="font-medium text-zinc-500">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                disabled={offset === 0 || isRefreshing}
                className="glass-btn-secondary !rounded-xl !px-3 !py-1.5 !text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Prev</span>
              </button>
              <button
                type="button"
                onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total || isRefreshing}
                className="glass-btn-secondary !rounded-xl !px-3 !py-1.5 !text-xs"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create User Modal */}
      <AnimatedModal
        open={isCreateOpen}
        onClose={handleCloseCreateModal}
        ariaLabelledBy="create-user-modal-title"
        maxWidthClassName="max-w-2xl"
      >
        <div className="border-b border-zinc-200/70 bg-white/60 px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <h2 id="create-user-modal-title" className="text-lg font-bold text-zinc-900">
                  Create User Account
                </h2>
                <p className="text-xs text-zinc-500">
                  Provision a student, instructor, or admin directly.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseCreateModal}
              disabled={isCreating}
              aria-label="Close modal"
              className="rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-4 p-6">
          {createError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50/80 px-3.5 py-2.5 text-xs font-medium text-rose-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <span>{createError}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="create-user-name" className="block text-xs font-semibold text-zinc-700">
                Full Name <span className="text-rose-600">*</span>
              </label>
              <input
                id="create-user-name"
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Amina Karimova"
                className="glass-input"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="create-user-email" className="block text-xs font-semibold text-zinc-700">
                Email Address <span className="text-rose-600">*</span>
              </label>
              <input
                id="create-user-email"
                type="email"
                required
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@school.edu"
                className="glass-input"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="create-user-password"
                className="block text-xs font-semibold text-zinc-700"
              >
                Temporary Password <span className="text-rose-600">*</span>
              </label>
              <input
                id="create-user-password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                className="glass-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="create-user-role"
                  className="block text-xs font-semibold text-zinc-700"
                >
                  Role
                </label>
                <select
                  id="create-user-role"
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, role: e.target.value as UserRole }))
                  }
                  className="glass-input"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="create-user-status"
                  className="block text-xs font-semibold text-zinc-700"
                >
                  Status
                </label>
                <select
                  id="create-user-status"
                  value={createForm.accountStatus}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      accountStatus: e.target.value as AccountStatus
                    }))
                  }
                  className="glass-input"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="create-user-school"
                className="block text-xs font-semibold text-zinc-700"
              >
                School
              </label>
              <input
                id="create-user-school"
                type="text"
                maxLength={160}
                value={createForm.school}
                onChange={(e) => setCreateForm((f) => ({ ...f, school: e.target.value }))}
                placeholder="School or academy name"
                className="glass-input"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="create-user-class"
                className="block text-xs font-semibold text-zinc-700"
              >
                Class / Group
              </label>
              <input
                id="create-user-class"
                type="text"
                maxLength={120}
                value={createForm.className}
                onChange={(e) => setCreateForm((f) => ({ ...f, className: e.target.value }))}
                placeholder="e.g. IELTS-B2"
                className="glass-input"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="create-user-telegram"
                className="block text-xs font-semibold text-zinc-700"
              >
                Telegram
              </label>
              <input
                id="create-user-telegram"
                type="text"
                maxLength={120}
                value={createForm.telegramId}
                onChange={(e) => setCreateForm((f) => ({ ...f, telegramId: e.target.value }))}
                placeholder="@username or chat ID"
                className="glass-input"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="create-user-parent-phone"
                className="block text-xs font-semibold text-zinc-700"
              >
                Parent Phone
              </label>
              <input
                id="create-user-parent-phone"
                type="tel"
                maxLength={40}
                value={createForm.parentPhone}
                onChange={(e) => setCreateForm((f) => ({ ...f, parentPhone: e.target.value }))}
                placeholder="+998 90 123 45 67"
                className="glass-input"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="create-user-parent-telegram"
                className="block text-xs font-semibold text-zinc-700"
              >
                Parent Telegram
              </label>
              <input
                id="create-user-parent-telegram"
                type="text"
                maxLength={120}
                value={createForm.parentTelegramId}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, parentTelegramId: e.target.value }))
                }
                placeholder="@parent_username or chat ID"
                className="glass-input"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="create-user-bio" className="block text-xs font-semibold text-zinc-700">
                Bio / Notes
              </label>
              <textarea
                id="create-user-bio"
                rows={3}
                maxLength={1000}
                value={createForm.bio}
                onChange={(e) => setCreateForm((f) => ({ ...f, bio: e.target.value }))}
                placeholder="Optional instructor bio or student notes..."
                className="glass-input resize-y"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-200/70 pt-4">
            <button
              type="button"
              onClick={handleCloseCreateModal}
              disabled={isCreating}
              className="glass-btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={isCreating} className="glass-btn-primary">
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  <span>Create User</span>
                </>
              )}
            </button>
          </div>
        </form>
      </AnimatedModal>

      {/* Adjust / Top-Up Credits Modal */}
      <AnimatedModal
        open={creditModalUser !== null}
        onClose={() => {
          if (!isAdjustingCredits) setCreditModalUser(null);
        }}
        ariaLabelledBy="adjust-credits-modal-title"
        maxWidthClassName="max-w-md"
      >
        <form onSubmit={(e) => void handleAdjustCreditsSubmit(e)} className="space-y-4 p-6">
          <div className="flex items-center justify-between border-b border-zinc-900/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-white">
                <Coins className="h-4 w-4" />
              </span>
              <div>
                <h2
                  id="adjust-credits-modal-title"
                  className="text-base font-extrabold tracking-tight text-zinc-950"
                >
                  Adjust / Top-Up Credits
                </h2>
                <p className="text-xs text-zinc-500">
                  {creditModalUser?.name || creditModalUser?.email || 'User'} · Current balance:{' '}
                  <strong className="text-zinc-800">{creditModalUser?.creditBalance ?? 0} cr</strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={isAdjustingCredits}
              onClick={() => setCreditModalUser(null)}
              aria-label="Close credits modal"
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-900/[0.06]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {creditModalError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200/80 bg-rose-50/85 px-3.5 py-2.5 text-xs text-rose-800"
            >
              {creditModalError}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="credit-tx-type"
                className="mb-1 block text-xs font-semibold text-zinc-600"
              >
                Transaction Type
              </label>
              <select
                id="credit-tx-type"
                value={creditType}
                onChange={(e) =>
                  setCreditType(e.target.value as 'TOP_UP' | 'ADJUSTMENT' | 'REFUND')
                }
                className="glass-input"
              >
                <option value="TOP_UP">Top-Up</option>
                <option value="ADJUSTMENT">Adjustment (+/-)</option>
                <option value="REFUND">Refund</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="credit-tx-amount"
                className="mb-1 block text-xs font-semibold text-zinc-600"
              >
                Credit Amount
              </label>
              <input
                id="credit-tx-amount"
                type="number"
                step={1}
                required
                value={creditAmountInput}
                onChange={(e) => setCreditAmountInput(e.target.value)}
                placeholder="e.g. 50 or -10"
                className="glass-input tabular-nums"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="credit-tx-note"
              className="mb-1 block text-xs font-semibold text-zinc-600"
            >
              Audit Note *
            </label>
            <input
              id="credit-tx-note"
              type="text"
              required
              minLength={2}
              maxLength={300}
              value={creditNoteInput}
              onChange={(e) => setCreditNoteInput(e.target.value)}
              placeholder="e.g., Term 2 credit top-up or manual correction"
              className="glass-input"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isAdjustingCredits}
              onClick={() => setCreditModalUser(null)}
              className="glass-btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={isAdjustingCredits} className="glass-btn-primary">
              {isAdjustingCredits ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Coins className="h-4 w-4" />
              )}
              Apply Credits
            </button>
          </div>
        </form>
      </AnimatedModal>
    </PageEntrance>
  );
}
