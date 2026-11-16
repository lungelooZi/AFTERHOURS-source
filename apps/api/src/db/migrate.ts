import { readdir, readFile } from 'node:fs/promises';
import type pg from 'pg';

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);
// Arbitrary constant: two API instances starting at once must not migrate concurrently.
const LOCK_ID = 727_4001;

/**
 * Forward-only SQL migrations. Each file runs once, inside a transaction, in filename
 * order. A failed migration rolls back completely and stops the run.
 */
export async function migrate(pool: pg.Pool, log: (msg: string) => void = console.log): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f)).sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(new URL(file, MIGRATIONS_DIR), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
      applied.push(file);
      log(`[migrate] applied ${file}`);
    }
    if (!applied.length) log('[migrate] database is up to date');
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => undefined);
    client.release();
  }
}
