/**
 * Sliding-window attempt limiter.
 *
 * In-memory on purpose for now: AFTERHOURS runs as a single API instance. When we
 * scale horizontally this moves to Redis behind the same interface (see ADR-0005),
 * otherwise each instance would allow its own N attempts.
 */
export interface AttemptLimiter {
  /** Seconds until the key may try again, or 0 if allowed. Does not record anything. */
  retryAfter(key: string): number;
  recordFailure(key: string): void;
  reset(key: string): void;
}

export class SlidingWindowLimiter implements AttemptLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(max: number, windowMs: number, now: () => number = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  private recent(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const kept = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length) this.hits.set(key, kept);
    else this.hits.delete(key);
    return kept;
  }

  retryAfter(key: string): number {
    const recent = this.recent(key);
    if (recent.length < this.max) return 0;
    const oldestThatCounts = recent[recent.length - this.max]!;
    return Math.max(1, Math.ceil((oldestThatCounts + this.windowMs - this.now()) / 1000));
  }

  recordFailure(key: string): void {
    const recent = this.recent(key);
    recent.push(this.now());
    this.hits.set(key, recent);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Drops keys whose attempts have all expired, so memory stays bounded by active attackers. */
  sweep(): void {
    for (const key of [...this.hits.keys()]) this.recent(key);
  }

  /** Number of keys currently tracked; exposed for tests and metrics. */
  get size(): number {
    return this.hits.size;
  }
}
