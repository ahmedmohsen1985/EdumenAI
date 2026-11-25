'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { NotificationView, UserRole } from '@edumenai/shared';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  BookOpen,
  CheckCheck,
  ChevronDown,
  FileText,
  GraduationCap,
  Loader2,
  LogOut,
  Settings,
  Sparkles,
  User
} from 'lucide-react';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '../lib/api';
import { useAuth } from './auth/AuthProvider';
import { getFirstName, getInitials, sanitizeNextPath } from './auth/auth-utils';
import { SPRING_SNAPPY, SlidingTabButton } from './ui/MotionPrimitives';

interface NavLinkItem {
  href: string;
  label: string;
  matchPrefix: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  instructorOnly?: boolean;
}

const NAV_LINKS: NavLinkItem[] = [
  {
    href: '/exercises',
    label: 'Exercises',
    matchPrefix: '/exercises',
    icon: BookOpen
  },
  {
    href: '/reports',
    label: 'Reports',
    matchPrefix: '/reports',
    icon: FileText
  },
  {
    href: '/instructor',
    label: 'Instructor Studio',
    matchPrefix: '/instructor',
    icon: GraduationCap,
    instructorOnly: true
  },
  {
    href: '/admin',
    label: 'Admin Studio',
    matchPrefix: '/admin',
    icon: Settings,
    adminOnly: true
  }
];

function formatRoleLabel(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'INSTRUCTOR':
      return 'Instructor';
    default:
      return 'Student';
  }
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return 'Just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function Navbar(): React.ReactElement {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const {
    user,
    isLoading: authLoading,
    unreadNotificationCount,
    setUnreadNotificationCount,
    logout
  } = useAuth();

  const [notifOpen, setNotifOpen] = useState<boolean>(false);
  const [accountOpen, setAccountOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationView[]>([]);
  const [notifLoading, setNotifLoading] = useState<boolean>(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  const notifRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);

  const isActiveInstructor =
    user?.role === 'INSTRUCTOR' && user.accountStatus === 'ACTIVE';

  const visibleLinks = useMemo(
    () =>
      NAV_LINKS.filter((item) => {
        if (item.adminOnly) return user?.role === 'ADMIN';
        if (item.instructorOnly) return isActiveInstructor;
        return true;
      }),
    [isActiveInstructor, user?.role]
  );

  // Close popovers on navigation
  useEffect(() => {
    setNotifOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  // Close popovers on outside click or Escape
  useEffect(() => {
    if (!notifOpen && !accountOpen) return undefined;

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (notifOpen && notifRef.current && target && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }
      if (accountOpen && accountRef.current && target && !accountRef.current.contains(target)) {
        setAccountOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setNotifOpen(false);
        setAccountOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountOpen, notifOpen]);

  const loadNotifications = useCallback(async () => {
    setNotifLoading(true);
    setNotifError(null);
    try {
      const res = await fetchNotifications();
      setNotifications(res.items);
      setUnreadNotificationCount(res.unreadCount);
    } catch (err: unknown) {
      setNotifError(err instanceof Error ? err.message : 'Unable to load notifications.');
    } finally {
      setNotifLoading(false);
    }
  }, [setUnreadNotificationCount]);

  const handleToggleNotifications = (): void => {
    const nextOpen = !notifOpen;
    setAccountOpen(false);
    setNotifOpen(nextOpen);
    if (nextOpen) {
      void loadNotifications();
    }
  };

  const handleNotificationClick = async (item: NotificationView): Promise<void> => {
    if (!item.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
      setUnreadNotificationCount(Math.max(0, unreadNotificationCount - 1));
      try {
        await markNotificationRead(item.id);
      } catch {
        // Keep optimistic UX non-blocking
      }
    }
    setNotifOpen(false);
    const safeLink = sanitizeNextPath(item.link);
    if (safeLink) {
      router.push(safeLink);
    }
  };

  const handleMarkAllRead = async (): Promise<void> => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadNotificationCount(0);
    } catch (err: unknown) {
      setNotifError(err instanceof Error ? err.message : 'Failed to mark notifications read.');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    setSigningOut(true);
    try {
      await logout();
      setAccountOpen(false);
      router.push('/login');
    } finally {
      setSigningOut(false);
    }
  };

  const unreadBadgeText = unreadNotificationCount > 99 ? '99+' : String(unreadNotificationCount);

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 print:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 rounded-2xl border border-white/80 bg-white/70 px-3 py-2 shadow-glass ring-1 ring-zinc-900/[0.05] backdrop-blur-2xl sm:px-4">
        {/* Brand */}
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_6px_14px_-6px_rgba(15,17,21,0.5)] transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105">
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div className="leading-tight">
            <div className="text-base font-extrabold tracking-tight text-zinc-900">
              Edumen<span className="text-zinc-500">AI</span>
            </div>
            <div className="hidden text-[11px] font-medium text-zinc-500 md:block">
              Oxford AQA Assessment Platform
            </div>
          </div>
        </Link>

        {/* Center Navigation */}
        <nav className="flex items-center gap-1" aria-label="Main navigation">
          {visibleLinks.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              pathname.startsWith(`${item.matchPrefix}/`) ||
              (item.href === '/exercises' && pathname === '/');

            return (
              <SlidingTabButton
                key={item.href}
                href={item.href}
                layoutId="navbar-active-pill"
                isActive={isActive}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </SlidingTabButton>
            );
          })}
        </nav>

        {/* Right Controls: Auth / Notifications / Account */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {authLoading ? (
            <div
              aria-hidden="true"
              className="h-9 w-24 animate-pulse rounded-xl bg-zinc-900/[0.06]"
            />
          ) : !user ? (
            <>
              <Link
                href="/login"
                className="glass-btn-secondary !px-3 !py-2 !text-xs sm:!px-3.5 sm:!text-sm"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="glass-btn-primary !px-3 !py-2 !text-xs sm:!px-3.5 sm:!text-sm"
              >
                Get Started
              </Link>
            </>
          ) : (
            <>
              {/* Notification Bell */}
              <div ref={notifRef} className="relative">
                <button
                  type="button"
                  onClick={handleToggleNotifications}
                  aria-label="Notifications"
                  aria-expanded={notifOpen}
                  aria-haspopup="dialog"
                  className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/90 bg-white/70 text-zinc-700 ring-1 ring-zinc-900/[0.08] backdrop-blur-md transition-all duration-200 hover:bg-white/95 hover:text-zinc-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/15"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotificationCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-zinc-900 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                      {unreadBadgeText}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {notifOpen && (
                    <motion.div
                      key="notifications-popover"
                      role="dialog"
                      aria-label="Notifications"
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.97 }}
                      transition={SPRING_SNAPPY}
                      className="glass-panel-strong absolute right-0 mt-2 w-80 overflow-hidden sm:w-96"
                    >
                      <div className="flex items-center justify-between border-b border-zinc-900/[0.06] px-4 py-3">
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-bold text-zinc-950">Notifications</h2>
                          {unreadNotificationCount > 0 && (
                            <span className="glass-pill !px-2 !py-0 text-[11px]">
                              {unreadNotificationCount} new
                            </span>
                          )}
                        </div>
                        {notifications.some((n) => !n.isRead) && (
                          <button
                            type="button"
                            onClick={() => void handleMarkAllRead()}
                            disabled={markingAll}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-900/[0.06] hover:text-zinc-950 disabled:opacity-50"
                          >
                            {markingAll ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCheck className="h-3.5 w-3.5" />
                            )}
                            Mark all read
                          </button>
                        )}
                      </div>

                      <div className="max-h-96 overflow-y-auto">
                        {notifLoading ? (
                          <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-zinc-500">
                            <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />
                            Loading notifications...
                          </div>
                        ) : notifError ? (
                          <div className="px-4 py-4 text-xs text-rose-700">{notifError}</div>
                        ) : notifications.length === 0 ? (
                          <div className="px-4 py-10 text-center">
                            <Bell className="mx-auto h-5 w-5 text-zinc-400" />
                            <p className="mt-2 text-xs font-semibold text-zinc-700">
                              You&apos;re all caught up
                            </p>
                            <p className="mt-0.5 text-[11px] text-zinc-500">
                              Enrollment updates and approvals will appear here.
                            </p>
                          </div>
                        ) : (
                          <ul className="divide-y divide-zinc-900/[0.05]">
                            {notifications.map((item) => (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  onClick={() => void handleNotificationClick(item)}
                                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/80 ${
                                    item.isRead ? 'bg-transparent' : 'bg-white/60'
                                  }`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                      item.isRead ? 'bg-zinc-300' : 'bg-zinc-900'
                                    }`}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <p
                                        className={`truncate text-xs ${
                                          item.isRead
                                            ? 'font-medium text-zinc-700'
                                            : 'font-bold text-zinc-950'
                                        }`}
                                      >
                                        {item.title}
                                      </p>
                                      <span className="shrink-0 whitespace-nowrap text-[10px] text-zinc-400">
                                        {formatRelativeTime(item.createdAt)}
                                      </span>
                                    </div>
                                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-600">
                                      {item.body}
                                    </p>
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* User Account Pill */}
              <div ref={accountRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(false);
                    setAccountOpen((prev) => !prev);
                  }}
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 rounded-xl border border-white/90 bg-white/75 py-1 pl-1.5 pr-2.5 text-left ring-1 ring-zinc-900/[0.08] backdrop-blur-md transition-all duration-200 hover:bg-white/95 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/15"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white shadow-sm">
                    {getInitials(user.name, user.email)}
                  </span>
                  <span className="hidden max-w-[92px] truncate text-xs font-semibold text-zinc-900 sm:inline">
                    {getFirstName(user.name, user.email)}
                  </span>
                  <span
                    className={`hidden shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold lg:inline-flex ${
                      user.accountStatus === 'PENDING_APPROVAL'
                        ? 'border border-amber-200 bg-amber-50 text-amber-800'
                        : 'bg-zinc-900/[0.06] text-zinc-600'
                    }`}
                  >
                    {formatRoleLabel(user.role)}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-zinc-500 transition-transform duration-200 ${
                      accountOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {accountOpen && (
                    <motion.div
                      key="account-menu"
                      role="menu"
                      aria-label="Account menu"
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.97 }}
                      transition={SPRING_SNAPPY}
                      className="glass-panel-strong absolute right-0 mt-2 w-64 overflow-hidden p-1.5"
                    >
                      <div className="border-b border-zinc-900/[0.06] px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-bold text-zinc-950">
                            {user.name || 'Account'}
                          </p>
                          <span className="glass-pill !px-2 !py-0 text-[10px]">
                            {formatRoleLabel(user.role)}
                          </span>
                        </div>
                        {user.email && (
                          <p className="mt-0.5 truncate text-xs text-zinc-500">{user.email}</p>
                        )}
                        {user.accountStatus === 'PENDING_APPROVAL' && (
                          <span className="mt-2 inline-flex shrink-0 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Pending Admin Approval
                          </span>
                        )}
                      </div>

                      <div className="py-1">
                        <Link
                          href="/profile"
                          role="menuitem"
                          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-900/[0.05] hover:text-zinc-950"
                        >
                          <User className="h-4 w-4 text-zinc-500" />
                          My Profile
                        </Link>
                        {isActiveInstructor && (
                          <Link
                            href="/instructor"
                            role="menuitem"
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-900/[0.05] hover:text-zinc-950"
                          >
                            <GraduationCap className="h-4 w-4 text-zinc-500" />
                            Instructor Studio
                          </Link>
                        )}
                        {user.role === 'ADMIN' && (
                          <Link
                            href="/admin"
                            role="menuitem"
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-900/[0.05] hover:text-zinc-950"
                          >
                            <Settings className="h-4 w-4 text-zinc-500" />
                            Admin Studio
                          </Link>
                        )}
                      </div>

                      <div className="border-t border-zinc-900/[0.06] pt-1">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void handleSignOut()}
                          disabled={signingOut}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50/80 disabled:opacity-50"
                        >
                          {signingOut ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <LogOut className="h-4 w-4" />
                          )}
                          Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
