import { buildApp } from './app.ts';
import { MemoryAuthStore } from './auth/memory-store.ts';
import { PostgresAuthStore } from './auth/postgres-store.ts';
import { SlidingWindowLimiter } from './auth/rate-limiter.ts';
import { AuthService } from './auth/service.ts';
import type { AuthStore } from './auth/types.ts';
import { MemoryCaseStore } from './cases/memory-store.ts';
import { PostgresCaseStore } from './cases/postgres-store.ts';
import { CaseService } from './cases/service.ts';
import type { CaseStore } from './cases/store.ts';
import { loadConfig } from './config.ts';
import { migrate } from './db/migrate.ts';
import { createPool, ping } from './db/pool.ts';
import { ConsoleMailer } from './mail/mailer.ts';

const config = loadConfig();

let authStore: AuthStore;
let caseStore: CaseStore;
let checkDatabase: () => Promise<boolean>;
let closeDatabase = async () => {};

if (config.store === 'postgres') {
  const pool = createPool(config.databaseUrl!);
  await migrate(pool);
  authStore = new PostgresAuthStore(pool);
  caseStore = new PostgresCaseStore(pool);
  checkDatabase = () => ping(pool);
  closeDatabase = () => pool.end();
} else {
  console.warn('[store] STORE=memory: no database. Accounts and progress are lost when the API stops.');
  authStore = new MemoryAuthStore();
  caseStore = new MemoryCaseStore();
  checkDatabase = async () => true;
}

const limiters = {
  account: new SlidingWindowLimiter(config.login.maxAttempts, config.login.windowMs),
  ip: new SlidingWindowLimiter(config.login.maxAttempts * 10, config.login.windowMs),
  // At most 3 reset emails per email address and IP per hour.
  reset: new SlidingWindowLimiter(3, 60 * 60 * 1000),
};
// At most 30 new guest players per IP per hour.
const guestLimiter = new SlidingWindowLimiter(30, 60 * 60 * 1000);
// At most 10 wrong archive passwords per run per 10 minutes.
const guessLimiter = new SlidingWindowLimiter(10, 10 * 60 * 1000);
const sweeper = setInterval(() => [...Object.values(limiters), guestLimiter, guessLimiter].forEach((l) => l.sweep()), 60_000);
sweeper.unref();

const app = await buildApp({
  auth: new AuthService({
    store: authStore,
    limiters,
    sessionTtlMs: config.sessionTtlMs,
    mailer: new ConsoleMailer(),
    appUrl: config.appUrl,
    resetTtlMs: config.passwordResetTtlMs,
  }),
  store: authStore,
  cases: new CaseService({ store: caseStore, guestLimiter, guessLimiter }),
  checkDatabase,
  secureCookies: config.env === 'production',
  trustProxy: config.trustProxy,
  logger: config.env !== 'test',
});

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await closeDatabase();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.host, port: config.port });
