interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class TtlCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = 60_000): void {
    if (ttlMs <= 0) {
      this.store.delete(key);
      return;
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs = 60_000
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    const promise = factory()
      .then((result) => {
        this.set(key, result, ttlMs);
        return result;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  del(key: string): void {
    this.store.delete(key);
  }

  delPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }
}

export const appCache = new TtlCache();
