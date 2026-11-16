import pg from 'pg';

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  // An idle client erroring (e.g. the database restarted) must not crash the process.
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  return pool;
}

export async function ping(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
