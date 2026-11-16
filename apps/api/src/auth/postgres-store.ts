import type pg from 'pg';
import {
  EmailTakenError,
  type AuditEntry,
  type AuthStore,
  type NewAuditEntry,
  type NewPasswordReset,
  type NewSession,
  type NewUser,
  type Role,
  type Session,
  type User,
  type UserWithSecret,
} from './types.ts';

const USER_COLUMNS = 'u.id, u.email, u.display_name, u.role, u.created_at';

type UserRow = { id: string; email: string; display_name: string; role: Role; created_at: Date };

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name,
  role: r.role,
  createdAt: r.created_at,
});

/** Postgres implementation of AuthStore. Every query is parameterised. */
export class PostgresAuthStore implements AuthStore {
  private readonly db: pg.Pool;

  constructor(db: pg.Pool) {
    this.db = db;
  }

  async createUser(input: NewUser): Promise<User> {
    try {
      const { rows } = await this.db.query<UserRow>(
        `INSERT INTO users AS u (email, display_name, password_hash, role)
         VALUES ($1, $2, $3, $4) RETURNING ${USER_COLUMNS}`,
        [input.email, input.displayName, input.passwordHash, input.role],
      );
      return toUser(rows[0]!);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new EmailTakenError();
      throw err;
    }
  }

  async findUserByEmail(email: string): Promise<UserWithSecret | null> {
    const { rows } = await this.db.query<UserRow & { password_hash: string }>(
      `SELECT ${USER_COLUMNS}, u.password_hash FROM users u WHERE u.email = $1`,
      [email],
    );
    const row = rows[0];
    return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
  }

  async findUserById(id: string): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async setUserRole(id: string, role: Role): Promise<User | null> {
    const { rows } = await this.db.query<UserRow>(
      `UPDATE users AS u SET role = $2, updated_at = now() WHERE u.id = $1 RETURNING ${USER_COLUMNS}`,
      [id, role],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [id, passwordHash]);
  }

  async createSession(s: NewSession): Promise<void> {
    await this.db.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip) VALUES ($1, $2, $3, $4, $5)`,
      [s.tokenHash, s.userId, s.expiresAt, s.userAgent, s.ip],
    );
  }

  async findActiveSession(tokenHash: string, now: Date): Promise<{ session: Session; user: User } | null> {
    const { rows } = await this.db.query<
      UserRow & { token_hash: string; user_id: string; s_created_at: Date; expires_at: Date; revoked_at: Date | null; user_agent: string | null; ip: string | null }
    >(
      `SELECT s.token_hash, s.user_id, s.created_at AS s_created_at, s.expires_at, s.revoked_at, s.user_agent, host(s.ip) AS ip,
              ${USER_COLUMNS}
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2`,
      [tokenHash, now],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      session: {
        tokenHash: r.token_hash,
        userId: r.user_id,
        createdAt: r.s_created_at,
        expiresAt: r.expires_at,
        revokedAt: r.revoked_at,
        userAgent: r.user_agent,
        ip: r.ip,
      },
      user: toUser(r),
    };
  }

  async revokeSession(tokenHash: string, now: Date): Promise<void> {
    await this.db.query('UPDATE sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash, now]);
  }

  async revokeAllSessions(userId: string, now: Date): Promise<number> {
    const result = await this.db.query('UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL', [userId, now]);
    return result.rowCount ?? 0;
  }

  async createPasswordReset(r: NewPasswordReset): Promise<void> {
    await this.db.query('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, ip) VALUES ($1, $2, $3, $4)', [
      r.tokenHash, r.userId, r.expiresAt, r.ip,
    ]);
  }

  async completePasswordReset(tokenHash: string, passwordHash: string, now: Date): Promise<string | null> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      // The row lock taken by this UPDATE makes a concurrent use of the same token wait,
      // then match zero rows because used_at is no longer NULL.
      const { rows } = await client.query<{ user_id: string }>(
        `UPDATE password_reset_tokens SET used_at = $2
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2
          RETURNING user_id`,
        [tokenHash, now],
      );
      const userId = rows[0]?.user_id;
      if (!userId) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query('UPDATE password_reset_tokens SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL', [userId, now]);
      await client.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [userId, passwordHash]);
      await client.query('UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL', [userId, now]);
      await client.query('COMMIT');
      return userId;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async recordAudit(e: NewAuditEntry): Promise<void> {
    await this.db.query(
      'INSERT INTO audit_log (actor_id, action, target_id, ip, metadata) VALUES ($1, $2, $3, $4, $5)',
      [e.actorId, e.action, e.targetId, e.ip, JSON.stringify(e.metadata)],
    );
  }

  async listAudit(limit: number): Promise<AuditEntry[]> {
    const { rows } = await this.db.query<{
      id: string; actor_id: string | null; action: AuditEntry['action']; target_id: string | null;
      ip: string | null; metadata: Record<string, unknown>; created_at: Date;
    }>(
      `SELECT id::text, actor_id, action, target_id, host(ip) AS ip, metadata, created_at
         FROM audit_log ORDER BY created_at DESC, id DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      id: r.id, actorId: r.actor_id, action: r.action, targetId: r.target_id,
      ip: r.ip, metadata: r.metadata, createdAt: r.created_at,
    }));
  }
}
