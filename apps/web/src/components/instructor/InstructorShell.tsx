'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  Bot,
  Clock,
  FileText,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Loader2,
  LogIn,
  ShieldAlert,
  User,
  Users
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { PageEntrance, SlidingTabButton } from '../ui/MotionPrimitives';

const INSTRUCTOR_NAV_ITEMS = [
  { href: '/instructor', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/instructor/submissions', label: 'Submissions', icon: FileText, exact: false },
  { href: '/instructor/exercises', label: 'My Exercises', icon: Layers, exact: false },
  { href: '/instructor/students', label: 'My Students', icon: Users, exact: false },
  { href: '/instructor/telegram', label: 'Telegram Groups', icon: Bot, exact: false }
] as const;

export function InstructorShell({
  children
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname() || '/instructor';
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="glass-panel-strong flex items-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">
            Loading Instructor Studio...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <PageEntrance className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="glass-panel-strong relative overflow-hidden p-8 text-center sm:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-white via-zinc-200/70 to-transparent blur-2xl"
          />
          <div className="relative">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-glass-lg">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div className="mt-4 flex justify-center">
              <span className="glass-pill">Instructor Studio</span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-zinc-950">
              Sign In to Instructor Studio
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Sign in with your approved instructor account to manage students, review submissions,
              build custom exercises, and configure class Telegram groups.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/login?next=/instructor" className="glass-btn-primary">
                <LogIn className="h-4 w-4" />
                Sign In as Instructor
              </Link>
              <Link href="/register" className="glass-btn-secondary">
                Create Instructor Account
              </Link>
            </div>
          </div>
        </div>
      </PageEntrance>
    );
  }

  if (user.role === 'STUDENT') {
    return (
      <PageEntrance className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="glass-panel-strong p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900/[0.06] text-zinc-700">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-extrabold tracking-tight text-zinc-950">
            Instructor Access Required
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            This workspace is reserved for approved instructors and platform administrators. You can
            continue practicing and viewing your reports in the Student Portal.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/exercises" className="glass-btn-primary">
              Go to Exercises
            </Link>
            <Link href="/profile" className="glass-btn-secondary">
              My Profile
            </Link>
          </div>
        </div>
      </PageEntrance>
    );
  }

  if (user.accountStatus === 'SUSPENDED') {
    return (
      <PageEntrance className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 p-8 text-center shadow-glass backdrop-blur-xl">
          <AlertTriangle className="mx-auto h-8 w-8 text-rose-600" />
          <h1 className="mt-4 text-xl font-extrabold tracking-tight text-rose-950">
            Account Suspended
          </h1>
          <p className="mt-2 text-sm text-rose-800">
            Your instructor account is currently suspended. Contact an EdumenAI administrator for
            assistance.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/profile" className="glass-btn-secondary">
              View Profile
            </Link>
          </div>
        </div>
      </PageEntrance>
    );
  }

  if (user.role === 'INSTRUCTOR' && user.accountStatus === 'PENDING_APPROVAL') {
    return (
      <PageEntrance className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-amber-300/80 bg-amber-50/85 p-8 text-center shadow-glass-lg backdrop-blur-xl sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/80 bg-amber-100/90 text-amber-800">
            <Clock className="h-6 w-6" />
          </div>
          <div className="mt-4 flex justify-center">
            <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-amber-300 bg-amber-100/80 px-3 py-0.5 text-xs font-semibold text-amber-900">
              Pending Approval
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-amber-950">
            Account Pending Admin Approval
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-amber-900/90">
            Your instructor registration has been received. Once an EdumenAI administrator approves
            your account, Instructor Studio — including student rosters, custom exercise building,
            and class Telegram groups — will unlock automatically.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/profile" className="glass-btn-primary">
              <User className="h-4 w-4" />
              Complete Your Profile
            </Link>
            <Link href="/exercises" className="glass-btn-secondary">
              Browse Exercises
            </Link>
          </div>
        </div>
      </PageEntrance>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      {/* Floating Instructor Sub-Navigation */}
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm">
            <GraduationCap className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-extrabold tracking-tight text-zinc-950">
              Instructor Studio
            </div>
            <div className="text-[11px] font-medium text-zinc-500">
              {user.school || user.name || 'Educator Workspace'}
            </div>
          </div>
        </div>

        <nav
          aria-label="Instructor studio navigation"
          className="flex flex-wrap items-center gap-1"
        >
          {INSTRUCTOR_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <SlidingTabButton
                key={item.href}
                href={item.href}
                layoutId="instructor-nav-pill"
                isActive={isActive}
                className="!px-3 !py-1.5 !text-xs sm:!text-sm"
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>{item.label}</span>
              </SlidingTabButton>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
