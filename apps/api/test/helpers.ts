import { buildApp } from '../src/app.ts';
import { MemoryAuthStore } from '../src/auth/memory-store.ts';
import type { ScryptParams } from '../src/auth/password.ts';
import { SlidingWindowLimiter } from '../src/auth/rate-limiter.ts';
import { AuthService } from '../src/auth/service.ts';
import type { AuthStore } from '../src/auth/types.ts';
import { MemoryMailer } from '../src/mail/mailer.ts';
import { MemoryCaseStore } from '../src/cases/memory-store.ts';
import { CaseService } from '../src/cases/service.ts';
import type { CaseStore } from '../src/cases/store.ts';

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
    reset: new SlidingWindowLimiter(3, 60 * 60_000, clock.nowMs),
  };
  const mailer = new MemoryMailer();
  const auth = new AuthService({
    store,
    limiters,
    sessionTtlMs: opts.ttlMs ?? 60 * 60_000,
    now: clock.now,
    hashParams: FAST_HASH,
    mailer,
    appUrl: 'http://localhost:3000/',
    resetTtlMs: 30 * 60_000,
  });
  return { auth, store, clock, limiters, mailer };
}

export function makeCases(opts: { caseStore?: CaseStore; clock?: FakeClock; guestLimit?: number } = {}) {
  const clock = opts.clock ?? new FakeClock();
  const caseStore = opts.caseStore ?? new MemoryCaseStore();
  const guestLimiter = new SlidingWindowLimiter(opts.guestLimit ?? 30, 60 * 60_000, clock.nowMs);
  const guessLimiter = new SlidingWindowLimiter(10, 10 * 60_000, clock.nowMs);
  return { cases: new CaseService({ store: caseStore, guestLimiter, guessLimiter }), caseStore };
}

export async function makeApp(
  opts: Parameters<typeof makeService>[0] & { dbUp?: boolean; trustProxy?: boolean | string; caseStore?: CaseStore; guestLimit?: number } = {},
) {
  const service = makeService(opts);
  const { cases, caseStore } = makeCases({ caseStore: opts.caseStore, clock: service.clock, guestLimit: opts.guestLimit });
  const app = await buildApp({
    auth: service.auth,
    store: service.store,
    cases,
    checkDatabase: async () => opts.dbUp ?? true,
    secureCookies: false,
    trustProxy: opts.trustProxy,
  });
  return { app, ...service, cases, caseStore };
}

export const ctx = { ip: '203.0.113.7', userAgent: 'vitest' };
/** Pulls the reset token out of the most recent email. */
export function tokenFromEmail(mailer: MemoryMailer): string {
  const text = mailer.sent.at(-1)?.text ?? '';
  const match = text.match(/#reset=([\w-]+)/);
  if (!match?.[1]) throw new Error('no reset link in email');
  return match[1];
}

export const alice = { email: 'Alice@Example.com', password: 'correct horse battery', displayName: 'Alice' };
