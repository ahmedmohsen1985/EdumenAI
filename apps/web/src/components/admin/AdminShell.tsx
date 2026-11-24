'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  Bot,
  Cpu,
  KeyRound,
  LayoutDashboard,
  Layers,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Unlock
} from 'lucide-react';
import { ApiError } from '../../lib/api';
import {
  checkAdminAuth,
  clearStoredAdminKey,
  setStoredAdminKey
} from '../../lib/admin-auth';
import { PageEntrance, SlidingTabButton } from '../ui/MotionPrimitives';

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; mode: string }
  | { status: 'unauthorized'; errorMessage?: string }
  | { status: 'unconfigured'; errorMessage: string }
  | { status: 'error'; errorMessage: string };

const ADMIN_NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/exercises', label: 'Exercises & Builder', icon: Layers, exact: false },
  { href: '/admin/settings/ai', label: 'AI Providers', icon: Cpu, exact: false },
  { href: '/admin/integrations/telegram', label: 'Telegram', icon: Bot, exact: false }
] as const;

export function AdminShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading' });
  const [keyInput, setKeyInput] = useState<string>('');
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);

  const verifyAuth = useCallback(async (overrideKey?: string) => {
    try {
      const result = await checkAdminAuth(overrideKey);
      if (result.authenticated) {
        setAuthState({ status: 'authenticated', mode: result.mode });
      } else {
        setAuthState({ status: 'unauthorized', errorMessage: 'Admin authentication failed.' });
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          if (overrideKey !== undefined) {
            clearStoredAdminKey();
          }
          setAuthState({
            status: 'unauthorized',
            errorMessage: overrideKey !== undefined ? 'Invalid admin access key.' : undefined
          });
          return;
        }
        if (err.status === 503 || err.code === 'ADMIN_AUTH_UNCONFIGURED') {
          setAuthState({
            status: 'unconfigured',
            errorMessage:
              err.message ||
              'ADMIN_ACCESS_KEY must be configured in production before accessing Admin Studio.'
          });
          return;
        }
        setAuthState({ status: 'error', errorMessage: err.message });
        return;
      }
      setAuthState({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Failed to connect to Admin API.'
      });
    }
  }, []);

  useEffect(() => {
    void verifyAuth();
  }, [verifyAuth]);

  const handleUnlock = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;

    setIsUnlocking(true);
    setStoredAdminKey(trimmed);
    await verifyAuth(trimmed);
    setIsUnlocking(false);
    setKeyInput('');
  };

  const handleLock = (): void => {
    clearStoredAdminKey();
    setAuthState({ status: 'loading' });
    void verifyAuth('');
  };

  if (authState.status === 'loading') {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="glass-panel flex items-center justify-center gap-3 p-10">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">
            Verifying Admin Studio session...
          </span>
        </div>
      </div>
    );
  }

  if (authState.status === 'unconfigured') {
    return (
      <PageEntrance className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="glass-panel-strong border-amber-300/80 bg-amber-50/75 p-8">
          <div className="flex items-center gap-3 text-amber-900">
            <ShieldAlert className="h-7 w-7 shrink-0 text-amber-700" />
            <div>
              <h1 className="text-lg font-bold">Admin Authentication Unconfigured</h1>
              <p className="text-xs font-medium text-amber-800">HTTP 503 · Production Fail-Closed</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-amber-900">
            {authState.errorMessage}
          </p>
          <p className="mt-3 rounded-xl border border-amber-200/80 bg-white/75 px-3.5 py-2.5 font-mono text-xs text-amber-950">
            Set ADMIN_ACCESS_KEY in your API environment and restart the API service.
          </p>
        </div>
      </PageEntrance>
    );
  }

  if (authState.status === 'error') {
    return (
      <PageEntrance className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="glass-panel-strong border-rose-200/80 bg-rose-50/75 p-8">
          <div className="flex items-center gap-3 text-rose-900">
            <AlertTriangle className="h-6 w-6 shrink-0 text-rose-600" />
            <h1 className="text-lg font-bold">Admin Studio Connection Error</h1>
          </div>
          <p className="mt-3 text-sm text-rose-800">{authState.errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              setAuthState({ status: 'loading' });
              void verifyAuth();
            }}
            className="glass-btn-primary mt-5"
          >
            Retry Connection
          </button>
        </div>
      </PageEntrance>
    );
  }

  if (authState.status === 'unauthorized') {
    return (
      <PageEntrance className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <div className="glass-panel-strong overflow-hidden">
          <div className="border-b border-zinc-200/70 bg-white/60 px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-zinc-900">Admin Studio Access</h1>
                <p className="text-xs text-zinc-500">
                  Enter your platform admin key to continue
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={(e) => void handleUnlock(e)} className="space-y-4 p-6">
            {authState.errorMessage && (
              <div className="rounded-xl border border-rose-200/80 bg-rose-50/80 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                {authState.errorMessage}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="admin-access-key" className="block text-sm font-semibold text-zinc-800">
                Admin Access Key
              </label>
              <input
                id="admin-access-key"
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Enter ADMIN_ACCESS_KEY..."
                autoComplete="current-password"
                required
                className="glass-input"
              />
            </div>

            <button
              type="submit"
              disabled={isUnlocking || !keyInput.trim()}
              className="glass-btn-primary w-full"
            >
              {isUnlocking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4" />
                  <span>Unlock Admin Studio</span>
                </>
              )}
            </button>
          </form>
        </div>
      </PageEntrance>
    );
  }

  const isOpenDev = authState.mode === 'open_dev';

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* Floating Frosted Admin Sub-Navigation */}
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
        <div className="glass-panel flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <nav className="flex flex-wrap items-center gap-1" aria-label="Admin navigation">
            {ADMIN_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);

              return (
                <SlidingTabButton
                  key={item.href}
                  layoutId="admin-nav-pill"
                  href={item.href}
                  isActive={isActive}
                  className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold"
                  activeClassName="text-white"
                  inactiveClassName="text-zinc-600 hover:text-zinc-900"
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </SlidingTabButton>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                isOpenDev
                  ? 'border-amber-200/90 bg-amber-50/85 text-amber-800'
                  : 'border-emerald-200/90 bg-emerald-50/85 text-emerald-800'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {isOpenDev ? 'Dev Open Mode' : 'Key Active'}
            </span>

            {!isOpenDev && (
              <button
                type="button"
                onClick={handleLock}
                className="glass-btn-secondary !rounded-xl !px-3 !py-1.5 !text-xs"
              >
                <Lock className="h-3.5 w-3.5" />
                Lock
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
