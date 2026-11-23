'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
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
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-brand-navy" />
          <span className="text-sm font-medium text-slate-700">
            Verifying Admin Studio session...
          </span>
        </div>
      </div>
    );
  }

  if (authState.status === 'unconfigured') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-8 shadow-sm">
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
          <p className="mt-3 rounded-xl border border-amber-200 bg-white/70 px-3.5 py-2.5 font-mono text-xs text-amber-950">
            Set ADMIN_ACCESS_KEY in your API environment and restart the API service.
          </p>
        </div>
      </div>
    );
  }

  if (authState.status === 'error') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 shadow-sm">
          <div className="flex items-center gap-3 text-red-900">
            <AlertTriangle className="h-6 w-6 shrink-0 text-red-600" />
            <h1 className="text-lg font-bold">Admin Studio Connection Error</h1>
          </div>
          <p className="mt-3 text-sm text-red-800">{authState.errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              setAuthState({ status: 'loading' });
              void verifyAuth();
            }}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (authState.status === 'unauthorized') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
          <div className="bg-brand-navy px-6 py-6 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gold/20 text-brand-gold">
                <KeyRound className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Admin Studio Access</h1>
                <p className="text-xs text-slate-300">
                  Enter your platform admin key to continue
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={(e) => void handleUnlock(e)} className="space-y-4 p-6">
            {authState.errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                {authState.errorMessage}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="admin-access-key" className="block text-sm font-semibold text-slate-800">
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
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/15"
              />
            </div>

            <button
              type="submit"
              disabled={isUnlocking || !keyInput.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-navy/90 disabled:opacity-60"
            >
              {isUnlocking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4 text-brand-gold" />
                  <span>Unlock Admin Studio</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isOpenDev = authState.mode === 'open_dev';

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-slate-50">
      {/* Admin Sub-Navigation */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <nav className="flex flex-wrap items-center gap-1.5" aria-label="Admin navigation">
            {ADMIN_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-brand-navy text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-brand-navy'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-brand-gold' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                isOpenDev
                  ? 'border border-amber-200 bg-amber-50 text-amber-800'
                  : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {isOpenDev ? 'Dev Open Mode' : 'Key Active'}
            </span>

            {!isOpenDev && (
              <button
                type="button"
                onClick={handleLock}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
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
