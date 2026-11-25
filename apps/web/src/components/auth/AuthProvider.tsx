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
  type AuthSessionPayload
} from '../../lib/api';

export interface AuthContextValue {
  user: AuthUserView | null;
  approvedInstructors: PublicInstructorView[];
  pendingInstructorCount: number;
  unreadNotificationCount: number;
  isLoading: boolean;
  /** Re-fetch `/api/auth/me`. Resolves with the fresh user (or null). */
  refreshAuth: () => Promise<AuthUserView | null>;
  login: (email: string, password: string) => Promise<AuthUserView>;
  register: (payload: RegisterRequest) => Promise<AuthUserView>;
  logout: () => Promise<void>;
  /** Locally override the unread badge (e.g. after marking notifications read). */
  setUnreadNotificationCount: (count: number) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY_SESSION: AuthSessionPayload = {
  user: null,
  approvedInstructors: [],
  pendingInstructorCount: 0,
  unreadNotificationCount: 0
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
      // Network/API failure: treat as signed out without blocking the UI.
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

  const login = useCallback(
    async (email: string, password: string): Promise<AuthUserView> => {
      const user = await loginAccount({ email, password });
      setSession((prev) => ({ ...prev, user }));
      void refreshAuth();
      return user;
    },
    [refreshAuth]
  );

  const register = useCallback(
    async (payload: RegisterRequest): Promise<AuthUserView> => {
      const user = await registerAccount(payload);
      setSession((prev) => ({ ...prev, user }));
      void refreshAuth();
      return user;
    },
    [refreshAuth]
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
      isLoading,
      refreshAuth,
      login,
      register,
      logout,
      setUnreadNotificationCount
    }),
    [session, isLoading, refreshAuth, login, register, logout, setUnreadNotificationCount]
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
