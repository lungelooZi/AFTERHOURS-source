import { loadConfig } from '../config.ts';
import { migrate } from '../db/migrate.ts';
import { createPool } from '../db/pool.ts';

const config = loadConfig();
if (!config.databaseUrl) throw new Error("DATABASE_URL is required to run migrations.");
const pool = createPool(config.databaseUrl);
try {
  await migrate(pool);
} finally {
  await pool.end();
}
