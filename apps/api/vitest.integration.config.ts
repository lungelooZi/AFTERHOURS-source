import { defineConfig } from 'vitest/config';

// Integration tests: need DATABASE_URL pointing at a disposable Postgres database.
export default defineConfig({ test: { include: ['test/integration/**/*.test.ts'], fileParallelism: false } });
