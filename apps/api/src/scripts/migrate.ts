import { loadConfig } from '../config.ts';
import { migrate } from '../db/migrate.ts';
import { createPool } from '../db/pool.ts';

const pool = createPool(loadConfig().databaseUrl);
try {
  await migrate(pool);
} finally {
  await pool.end();
}
