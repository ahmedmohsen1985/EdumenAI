'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Coins,
  GraduationCap,
  Loader2,
  Shield,
  User,
  Users
} from 'lucide-react';
import type { AccountStatus, UserRole } from '@edumenai/shared';
import { useAuth } from '../../components/auth/AuthProvider';
import { getInitials } from '../../components/auth/auth-utils';
import {
  PageEntrance,
  SPRING_GENTLE,
  SlidingTabButton
} from '../../components/ui/MotionPrimitives';
import { Banner } from '../../components/profile/shared';
import { ProfileTab } from '../../components/profile/ProfileTab';
import { StudentInstructorsTab } from '../../components/profile/StudentInstructorsTab';
import { InstructorStudentsTab } from '../../components/profile/InstructorStudentsTab';
import { SecurityTab } from '../../components/profile/SecurityTab';

type ProfileTabId = 'profile' | 'connections' | 'security';

interface TabConfig {
  id: ProfileTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: 'Student',
  INSTRUCTOR: 'Instructor',
  ADMIN: 'Admin'
};

const ACCOUNT_STATUS_BADGE: Record<AccountStatus, { label: string; tone: string; dot: string }> = {
  ACTIVE: {
    label: 'Active',
    tone: 'bg-emerald-50/90 text-emerald-700 ring-emerald-600/20',
    dot: 'bg-emerald-500'
  },
  PENDING_APPROVAL: {
    label: 'Pending Approval',
    tone: 'bg-amber-50/90 text-amber-800 ring-amber-600/20',
    dot: 'bg-amber-500'
  },
  SUSPENDED: {
    label: 'Suspended',
    tone: 'bg-rose-50/90 text-rose-700 ring-rose-600/20',
    dot: 'bg-rose-500'
  }
};

export default function ProfilePage(): React.ReactElement {
  const router = useRouter();
  const { user, isLoading, refreshAuth, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTabId>('profile');

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login?next=/profile');
    }
  }, [isLoading, user, router]);

  const tabs = useMemo<TabConfig[]>(() => {
    const items: TabConfig[] = [
      { id: 'profile', label: 'Profile & Credits', icon: User }
    ];
    if (user?.role === 'STUDENT') {
      items.push({ id: 'connections', label: 'My Instructors', icon: GraduationCap });
    } else if (user?.role === 'INSTRUCTOR') {
      items.push({ id: 'connections', label: 'My Students', icon: Users });
    }
    items.push({ id: 'security', label: 'Security', icon: Shield });
    return items;
  }, [user?.role]);

  if (isLoading || !user) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div
          role="status"
          className="glass-panel-strong flex items-center gap-3 px-6 py-4 text-sm font-medium text-zinc-700"
        >
          <Loader2 className="h-4 w-4 animate-spin text-zinc-900" aria-hidden="true" />
          {isLoading ? 'Loading your profile…' : 'Redirecting to sign in…'}
        </div>
      </main>
    );
  }

  const effectiveTab: ProfileTabId =
    user.role === 'ADMIN' && activeTab === 'connections' ? 'profile' : activeTab;

  const initials = getInitials(user.name, user.email);
  const statusMeta = ACCOUNT_STATUS_BADGE[user.accountStatus];

  return (
    <PageEntrance className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Editorial Account Header */}
      <header className="glass-panel-strong p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <div
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-lg font-semibold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_8px_18px_-6px_rgba(15,17,21,0.45)]"
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-zinc-900">
                  {user.name?.trim() || user.email || 'Account'}
                </h1>
                <span className="glass-pill">{ROLE_LABELS[user.role]}</span>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${statusMeta.tone}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`}
                  />
                  {statusMeta.label}
                </span>
              </div>
              {user.email ? (
                <p className="mt-1 truncate text-sm text-zinc-600">{user.email}</p>
              ) : null}
            </div>
          </div>

          <div className="glass-pill self-start px-3.5 py-1.5 text-sm sm:self-center">
            <Coins className="h-4 w-4 text-zinc-500" aria-hidden="true" />
            <span className="font-semibold text-zinc-900 tabular-nums">{user.creditBalance}</span>
            <span className="text-zinc-500">Credits</span>
          </div>
        </div>
      </header>

      {/* Instructor Pending Approval Banner */}
      {user.role === 'INSTRUCTOR' && user.accountStatus === 'PENDING_APPROVAL' ? (
        <Banner kind="warning">
          <p className="font-semibold">Your instructor account is pending administrator approval</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-800/90">
            An administrator will review and activate your account soon. You can update your name,
            school, bio, and credit sponsorship preferences now so students see a complete profile
            as soon as you are approved.
          </p>
        </Banner>
      ) : null}

      {/* Tab Bar */}
      <nav
        role="tablist"
        aria-label="Profile sections"
        className="glass-panel flex flex-wrap gap-1.5 p-1.5"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = effectiveTab === tab.id;
          return (
            <SlidingTabButton
              key={tab.id}
              asTab
              layoutId="profile-tab-pill"
              isActive={isSelected}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 justify-center py-2.5 sm:flex-none"
            >
              <Icon
                className={`h-4 w-4 transition-colors duration-200 ${
                  isSelected ? 'text-zinc-300' : 'text-zinc-500'
                }`}
                aria-hidden="true"
              />
              {tab.label}
            </SlidingTabButton>
          );
        })}
      </nav>

      {/* Active Tab Panel */}
      <AnimatePresence mode="wait">
        <motion.div
          key={effectiveTab}
          role="tabpanel"
          aria-label={tabs.find((t) => t.id === effectiveTab)?.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={SPRING_GENTLE}
        >
          {effectiveTab === 'profile' ? (
            <ProfileTab key={user.id} user={user} onSaved={refreshAuth} />
          ) : effectiveTab === 'connections' && user.role === 'STUDENT' ? (
            <StudentInstructorsTab onChanged={refreshAuth} />
          ) : effectiveTab === 'connections' && user.role === 'INSTRUCTOR' ? (
            <InstructorStudentsTab accountStatus={user.accountStatus} onChanged={refreshAuth} />
          ) : (
            <SecurityTab onLogout={logout} />
          )}
        </motion.div>
      </AnimatePresence>
    </PageEntrance>
  );
}
