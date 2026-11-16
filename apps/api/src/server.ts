import { buildApp } from './app.ts';
import { PostgresAuthStore } from './auth/postgres-store.ts';
import { SlidingWindowLimiter } from './auth/rate-limiter.ts';
import { AuthService } from './auth/service.ts';
import { loadConfig } from './config.ts';
import { migrate } from './db/migrate.ts';
import { createPool, ping } from './db/pool.ts';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
await migrate(pool);

const store = new PostgresAuthStore(pool);
const limiters = {
  account: new SlidingWindowLimiter(config.login.maxAttempts, config.login.windowMs),
  ip: new SlidingWindowLimiter(config.login.maxAttempts * 10, config.login.windowMs),
};
const sweeper = setInterval(() => Object.values(limiters).forEach((l) => l.sweep()), 60_000);
sweeper.unref();

const app = await buildApp({
  auth: new AuthService({ store, limiters, sessionTtlMs: config.sessionTtlMs }),
  store,
  checkDatabase: () => ping(pool),
  secureCookies: config.env === 'production',
  trustProxy: config.trustProxy,
  logger: config.env !== 'test',
});

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await pool.end();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.host, port: config.port });
