import { loadConfig } from '../config.ts';
import { createPool } from '../db/pool.ts';
import { ROLES, type Role } from '../auth/types.ts';

/**
 * Bootstraps roles from the command line (there is no admin yet to do it over HTTP).
 * Usage: npm run promote -w @afterhours/api -- you@example.com admin
 */
const [email, role = 'admin'] = process.argv.slice(2);
if (!email || !(ROLES as readonly string[]).includes(role)) {
  console.error(`Usage: npm run promote -- <email> [${ROLES.join('|')}]`);
  process.exit(1);
}
const pool = createPool(loadConfig().databaseUrl);
try {
  const result = await pool.query('UPDATE users SET role = $2, updated_at = now() WHERE email = $1 RETURNING id', [email, role as Role]);
  if (!result.rowCount) {
    console.error(`No user with email ${email}. Register first.`);
    process.exitCode = 1;
  } else {
    await pool.query(
      `INSERT INTO audit_log (actor_id, action, target_id, metadata) VALUES (NULL, 'user.role_changed', $1, $2)`,
      [result.rows[0].id, JSON.stringify({ to: role, via: 'cli' })],
    );
    console.log(`${email} is now ${role}.`);
  }
} finally {
  await pool.end();
}
