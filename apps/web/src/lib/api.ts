/**
 * Runtime API client for browser and server-side calls.
 *
 * In the browser this points to NEXT_PUBLIC_API_URL.
 * On the server (SSR / Route Handlers) this resolves API_INTERNAL_URL,
 * falling back to NEXT_PUBLIC_API_URL or http://localhost:4000.
 */

function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return (
      process.env.API_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:4000'
    );
  }
  return process.env.NEXT_PUBLIC_API_URL || '';
}

function getApiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  const res = await fetch(getApiUrl(path), {
    ...options,
    headers: {
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || `API request failed: ${res.status}`);
  }

  return data as T;
}
