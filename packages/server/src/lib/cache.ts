interface Entry<V> {
  value: V;
  expiresAt: number;
}

/**
 * TTL cache with an insertion-ordered LRU-ish bound. A Map preserves insertion
 * order, so the oldest key is always the first one the iterator yields — that
 * is all the eviction policy this app needs, and it costs no dependency.
 */
export class TtlCache<V> {
  private readonly store = new Map<string, Entry<V>>();
  private hitCount = 0;
  private missCount = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) {
      this.missCount += 1;
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      this.missCount += 1;
      return undefined;
    }
    // Refresh recency so hot keys survive eviction.
    this.store.delete(key);
    this.store.set(key, entry);
    this.hitCount += 1;
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done === true) break;
      this.store.delete(oldest.value);
    }
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  get stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hitCount, misses: this.missCount, size: this.store.size };
  }
}
