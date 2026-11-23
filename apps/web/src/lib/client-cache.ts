interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const cacheStore = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  return entry.data as T;
}

export function isCacheFresh(key: string, ttlMs: number): boolean {
  const entry = cacheStore.get(key);
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < ttlMs;
}

export function setCached<T>(key: string, data: T): void {
  cacheStore.set(key, {
    data,
    fetchedAt: Date.now()
  });
}

export function invalidateCache(keyOrPrefix: string): void {
  for (const key of cacheStore.keys()) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
      cacheStore.delete(key);
    }
  }
}

export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { ttlMs?: number; force?: boolean } = {}
): Promise<T> {
  const ttlMs = options.ttlMs ?? 30_000;
  const force = Boolean(options.force);

  if (!force && isCacheFresh(key, ttlMs)) {
    const cached = getCached<T>(key);
    if (cached !== null) {
      return cached;
    }
  }

  if (!force) {
    const existing = inFlightRequests.get(key);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const request = fetcher()
    .then((data) => {
      setCached(key, data);
      return data;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, request);
  return request;
}
