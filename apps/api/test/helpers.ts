import { buildApp } from '../src/app.ts';
import { MemoryAuthStore } from '../src/auth/memory-store.ts';
import type { ScryptParams } from '../src/auth/password.ts';
import { SlidingWindowLimiter } from '../src/auth/rate-limiter.ts';
import { AuthService } from '../src/auth/service.ts';
import type { AuthStore } from '../src/auth/types.ts';

/** Cheap scrypt parameters so the suite stays fast. Production uses DEFAULT_PARAMS. */
export const FAST_HASH: ScryptParams = { N: 2 ** 10, r: 8, p: 1, keyLength: 64 };

export class FakeClock {
  ms: number;
  constructor(start = Date.parse('2026-11-16T10:00:00Z')) {
    this.ms = start;
  }
  now = () => new Date(this.ms);
  nowMs = () => this.ms;
  advance(ms: number) {
    this.ms += ms;
  }
}

export function makeService(opts: { store?: AuthStore; clock?: FakeClock; ttlMs?: number; maxAttempts?: number } = {}) {
  const clock = opts.clock ?? new FakeClock();
  const store = opts.store ?? new MemoryAuthStore();
  const max = opts.maxAttempts ?? 5;
  const limiters = {
    account: new SlidingWindowLimiter(max, 15 * 60_000, clock.nowMs),
    ip: new SlidingWindowLimiter(max * 10, 15 * 60_000, clock.nowMs),
  };
  const auth = new AuthService({ store, limiters, sessionTtlMs: opts.ttlMs ?? 60 * 60_000, now: clock.now, hashParams: FAST_HASH });
  return { auth, store, clock, limiters };
}

export async function makeApp(opts: Parameters<typeof makeService>[0] & { dbUp?: boolean; trustProxy?: boolean | string } = {}) {
  const service = makeService(opts);
  const app = await buildApp({
    auth: service.auth,
    store: service.store,
    checkDatabase: async () => opts.dbUp ?? true,
    secureCookies: false,
    trustProxy: opts.trustProxy,
  });
  return { app, ...service };
}

export const ctx = { ip: '203.0.113.7', userAgent: 'vitest' };
export const alice = { email: 'Alice@Example.com', password: 'correct horse battery', displayName: 'Alice' };
