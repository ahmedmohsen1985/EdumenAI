import { apiFetch } from './api';
import { fetchWithCache, invalidateCache } from './client-cache';

const ADMIN_KEY_STORAGE_KEY = 'edumenai_admin_key';

export function getStoredAdminKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(ADMIN_KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredAdminKey(key: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = key.trim();
  try {
    if (!trimmed) {
      window.sessionStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(ADMIN_KEY_STORAGE_KEY, trimmed);
    }
  } catch {
    // Ignore storage unavailability
  }
  invalidateCache('admin:');
}

export function clearStoredAdminKey(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
  } catch {
    // Ignore storage unavailability
  }
  invalidateCache('admin:');
}

export function getAdminAuthHeaders(overrideKey?: string): Record<string, string> {
  const key = (overrideKey !== undefined ? overrideKey : getStoredAdminKey()).trim();
  return key ? { 'x-admin-key': key } : {};
}

export async function adminFetch<T>(
  path: string,
  options: RequestInit & { adminKey?: string } = {}
): Promise<T> {
  const { adminKey, headers, ...rest } = options;
  const authHeaders = getAdminAuthHeaders(adminKey);

  return apiFetch<T>(path, {
    ...rest,
    headers: {
      ...authHeaders,
      ...(headers as Record<string, string> | undefined)
    }
  });
}

export async function checkAdminAuth(
  overrideKey?: string
): Promise<{ authenticated: boolean; mode: 'open_dev' | 'key' | string }> {
  const effectiveKey = (overrideKey !== undefined ? overrideKey : getStoredAdminKey()).trim();
  const cacheKey = `admin:auth:${effectiveKey || 'open'}`;

  return fetchWithCache(
    cacheKey,
    async () => {
      const res = await adminFetch<{
        success: true;
        data: { authenticated: boolean; mode: string };
      }>('/api/admin/auth/check', { adminKey: overrideKey });
      return res.data;
    },
    { ttlMs: 300_000 }
  );
}
