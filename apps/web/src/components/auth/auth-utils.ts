import type { AuthUserView } from '@edumenai/shared';

/**
 * Validates a `?next=` redirect target. Only same-origin relative paths are
 * allowed: must start with a single `/` (never `//`, `/\`, or a scheme).
 */
export function sanitizeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  const value = next.trim();
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/[\u0000-\u001f\\]/.test(value)) return null;
  return value;
}

/** Role-smart landing path after a successful login/registration. */
export function getPostLoginPath(
  user: Pick<AuthUserView, 'role'> & Partial<Pick<AuthUserView, 'accountStatus'>>,
  next: string | null | undefined
): string {
  const safe = sanitizeNextPath(next);
  if (safe) return safe;
  if (user.role === 'ADMIN') return '/admin';
  if (user.role === 'INSTRUCTOR') {
    return user.accountStatus === 'PENDING_APPROVAL' ? '/profile' : '/instructor';
  }
  return '/exercises';
}

export function getInitials(name: string | null | undefined, email?: string | null): string {
  const source = (name && name.trim()) || (email && email.trim()) || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${second}`.toUpperCase();
}

export function getFirstName(name: string | null | undefined, email?: string | null): string {
  const source = (name && name.trim()) || (email && email.split('@')[0]) || 'Account';
  return source.split(/\s+/)[0] ?? source;
}
