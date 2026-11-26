'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { AuthUserView, PublicInstructorView, RegisterRequest } from '@edumenai/shared';
import {
  fetchAuthSession,
  loginAccount,
  logoutAccount,
  registerAccount,
  type AuthSessionPayload,
  type LoginAccountResult,
  type RegisterAccountResult
} from '../../lib/api';

export interface AuthContextValue {
  user: AuthUserView | null;
  approvedInstructors: PublicInstructorView[];
  pendingInstructorCount: number;
  unreadNotificationCount: number;
  lowCreditThreshold: number;
  enforceCredits: boolean;
  isLowCredit: boolean;
  isLoading: boolean;
  /** Re-fetch `/api/auth/me`. Resolves with the fresh user (or null). */
  refreshAuth: () => Promise<AuthUserView | null>;
  login: (email: string, password: string) => Promise<LoginAccountResult>;
  register: (payload: RegisterRequest) => Promise<RegisterAccountResult>;
  /** Hydrate state immediately after 2FA/OTP verification completes and refresh session metadata. */
  completeAuthSession: (user: AuthUserView) => void;
  logout: () => Promise<void>;
  /** Locally override the unread badge (e.g. after marking notifications read). */
  setUnreadNotificationCount: (count: number) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY_SESSION: AuthSessionPayload = {
  user: null,
  approvedInstructors: [],
  pendingInstructorCount: 0,
  unreadNotificationCount: 0,
  lowCreditThreshold: 10,
  enforceCredits: false,
  isLowCredit: false
};

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [session, setSession] = useState<AuthSessionPayload>(EMPTY_SESSION);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const mountedRef = useRef<boolean>(true);

  const refreshAuth = useCallback(async (): Promise<AuthUserView | null> => {
    try {
      const next = await fetchAuthSession();
      if (mountedRef.current) setSession(next);
      return next.user;
    } catch {
      if (mountedRef.current) setSession(EMPTY_SESSION);
      return null;
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshAuth();
    return () => {
      mountedRef.current = false;
    };
  }, [refreshAuth]);

  const completeAuthSession = useCallback(
    (user: AuthUserView): void => {
      setSession((prev) => ({ ...prev, user }));
      void refreshAuth();
    },
    [refreshAuth]
  );

  const login = useCallback(
    async (email: string, password: string): Promise<LoginAccountResult> => {
      const result = await loginAccount({ email, password });
      if (!result.requiresTwoFactor) {
        completeAuthSession(result.user);
      }
      return result;
    },
    [completeAuthSession]
  );

  const register = useCallback(
    async (payload: RegisterRequest): Promise<RegisterAccountResult> => {
      const result = await registerAccount(payload);
      if (!result.requiresVerification) {
        completeAuthSession(result.user);
      }
      return result;
    },
    [completeAuthSession]
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutAccount();
    } finally {
      setSession(EMPTY_SESSION);
    }
  }, []);

  const setUnreadNotificationCount = useCallback((count: number): void => {
    setSession((prev) => ({ ...prev, unreadNotificationCount: Math.max(0, count) }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session.user,
      approvedInstructors: session.approvedInstructors,
      pendingInstructorCount: session.pendingInstructorCount,
      unreadNotificationCount: session.unreadNotificationCount,
      lowCreditThreshold: session.lowCreditThreshold,
      enforceCredits: session.enforceCredits,
      isLowCredit: session.isLowCredit,
      isLoading,
      refreshAuth,
      login,
      register,
      completeAuthSession,
      logout,
      setUnreadNotificationCount
    }),
    [
      session,
      isLoading,
      refreshAuth,
      login,
      register,
      completeAuthSession,
      logout,
      setUnreadNotificationCount
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}
