import { defineConfig } from 'vitest/config';

// Unit and HTTP tests: no database, run on every `npm test`.
export default defineConfig({ test: { include: ['test/*.test.ts'] } });
