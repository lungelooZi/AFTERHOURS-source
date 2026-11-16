import { z } from 'zod';

/**
 * All runtime configuration comes from environment variables and is validated
 * once at startup, so a misconfigured deployment fails fast with a clear message
 * instead of failing later on the first request.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  LOGIN_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Config = {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  sessionTtlMs: number;
  login: { maxAttempts: number; windowMs: number };
  trustProxy: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${problems}\nSee .env.example for the expected variables.`);
  }
  const c = parsed.data;
  return {
    env: c.NODE_ENV,
    host: c.HOST,
    port: c.PORT,
    databaseUrl: c.DATABASE_URL,
    sessionTtlMs: c.SESSION_TTL_HOURS * 60 * 60 * 1000,
    login: { maxAttempts: c.LOGIN_MAX_ATTEMPTS, windowMs: c.LOGIN_WINDOW_MINUTES * 60 * 1000 },
    trustProxy: c.TRUST_PROXY,
  };
}
