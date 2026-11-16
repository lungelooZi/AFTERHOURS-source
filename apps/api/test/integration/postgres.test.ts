import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresAuthStore } from '../../src/auth/postgres-store.ts';
import { SESSION_COOKIE } from '../../src/auth/routes.ts';
import { EmailTakenError } from '../../src/auth/types.ts';
import { migrate } from '../../src/db/migrate.ts';
import { createPool, ping } from '../../src/db/pool.ts';
import { hashToken } from '../../src/auth/tokens.ts';
import { PostgresCaseStore } from '../../src/cases/postgres-store.ts';
import { freshRun } from '@afterhours/game-engine';
import { alice, makeApp } from '../helpers.ts';

/**
 * Runs against a real Postgres. Locally: `docker compose up -d db`, then
 * DATABASE_URL=postgres://afterhours:afterhours@localhost:5432/afterhours_test npm run test:integration
 * In CI, GitHub Actions provides a Postgres service container.
 */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)('Postgres integration', () => {
  let pool: pg.Pool;
  let store: PostgresAuthStore;

  beforeAll(async () => {
    pool = createPool(url!);
    await pool.query('DROP TABLE IF EXISTS case_runs, password_reset_tokens, audit_log, sessions, users, schema_migrations CASCADE');
    await migrate(pool, () => undefined);
    store = new PostgresAuthStore(pool);
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE case_runs, password_reset_tokens, audit_log, sessions, users RESTART IDENTITY CASCADE');
  });
  afterAll(async () => {
    await pool?.end();
  });

  it('migrations are idempotent and recorded', async () => {
    expect(await migrate(pool, () => undefined)).toEqual([]);
    const { rows } = await pool.query('SELECT name FROM schema_migrations');
    expect(rows.map((r) => r.name)).toEqual(expect.arrayContaining(['0001_identity.sql', '0002_password_resets.sql', '0003_session_ids.sql', '0004_case_runs.sql']));
    expect(await ping(pool)).toBe(true);
  });

  it('concurrent migration runs do not collide (advisory lock)', async () => {
    await pool.query('DROP TABLE IF EXISTS case_runs, password_reset_tokens, audit_log, sessions, users, schema_migrations CASCADE');
    const results = await Promise.all([migrate(pool, () => undefined), migrate(pool, () => undefined)]);
    expect(results.flat()).toEqual(['0001_identity.sql', '0002_password_resets.sql', '0003_session_ids.sql', '0004_case_runs.sql']);
  });

  it('enforces case-insensitive unique emails at the database level', async () => {
    await store.createUser({ email: 'alice@example.com', displayName: 'Alice', passwordHash: 'x', role: 'player' });
    await expect(
      store.createUser({ email: 'ALICE@EXAMPLE.COM', displayName: 'Alice 2', passwordHash: 'x', role: 'player' }),
    ).rejects.toBeInstanceOf(EmailTakenError);
    expect((await store.findUserByEmail('Alice@Example.com'))?.displayName).toBe('Alice');
  });

  it('rejects roles outside the allowed set even if application checks are bypassed', async () => {
    await expect(
      pool.query(`INSERT INTO users (email, display_name, password_hash, role) VALUES ('x@y.z', 'Xy', 'h', 'superuser')`),
    ).rejects.toThrow(/check constraint/);
  });

  it('only returns sessions that are unrevoked and unexpired', async () => {
    const user = await store.createUser({ email: 'a@b.co', displayName: 'Ab', passwordHash: 'x', role: 'player' });
    const now = new Date('2026-11-16T10:00:00Z');
    await store.createSession({ createdAt: new Date(), tokenHash: 'a'.repeat(64), userId: user.id, expiresAt: new Date(now.getTime() + 1000), ip: '203.0.113.7', userAgent: 'ua' });
    const found = await store.findActiveSession('a'.repeat(64), now);
    expect(found?.user.id).toBe(user.id);
    expect(found?.session.ip).toBe('203.0.113.7');
    expect(await store.findActiveSession('a'.repeat(64), new Date(now.getTime() + 1000))).toBeNull();
    await store.revokeSession('a'.repeat(64), now);
    expect(await store.findActiveSession('a'.repeat(64), now)).toBeNull();
  });

  it('deleting a user cascades to sessions and keeps audit rows', async () => {
    const user = await store.createUser({ email: 'gone@b.co', displayName: 'Gone', passwordHash: 'x', role: 'player' });
    await store.createSession({ createdAt: new Date(), tokenHash: 'b'.repeat(64), userId: user.id, expiresAt: new Date(Date.now() + 60_000), ip: null, userAgent: null });
    await store.recordAudit({ actorId: user.id, action: 'user.registered', targetId: user.id, ip: null, metadata: { k: 1 } });
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    expect((await pool.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n).toBe(0);
    const [entry] = await store.listAudit(1);
    expect(entry).toMatchObject({ actorId: null, targetId: user.id, metadata: { k: 1 } });
  });

  it('full HTTP flow works end to end on Postgres', async () => {
    const { app } = await makeApp({ store });
    const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: alice });
    expect(reg.statusCode).toBe(201);
    const dupe = await app.inject({ method: 'POST', url: '/auth/register', payload: alice });
    expect(dupe.statusCode).toBe(409);

    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: alice });
    const cookie = `${SESSION_COOKIE}=${login.cookies.find((c) => c.name === SESSION_COOKIE)!.value}`;
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } })).json().user.email).toBe('alice@example.com');

    expect((await app.inject({ method: 'POST', url: '/auth/logout-all', headers: { cookie } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } })).statusCode).toBe(401);

    const actions = (await store.listAudit(10)).map((e) => e.action);
    expect(actions).toEqual(['session.revoked_all', 'session.created', 'session.created', 'user.registered']);
    await app.close();
  });

  describe('password reset', () => {
    const setup = async () => {
      const user = await store.createUser({ email: 'r@b.co', displayName: 'Reset', passwordHash: 'old', role: 'player' });
      const expiresAt = new Date(Date.now() + 60_000);
      await store.createPasswordReset({ tokenHash: hashToken('token-one'), userId: user.id, expiresAt, ip: '203.0.113.7' });
      await store.createPasswordReset({ tokenHash: hashToken('token-two'), userId: user.id, expiresAt, ip: null });
      await store.createSession({ createdAt: new Date(), tokenHash: 'c'.repeat(64), userId: user.id, expiresAt, ip: null, userAgent: null });
      return user;
    };

    it('completes atomically: password, other tokens and sessions', async () => {
      const user = await setup();
      expect(await store.completePasswordReset(hashToken('token-one'), 'new-hash', new Date())).toBe(user.id);
      expect((await store.findUserByEmail('r@b.co'))?.passwordHash).toBe('new-hash');
      expect(await store.findActiveSession('c'.repeat(64), new Date())).toBeNull();
      expect(await store.completePasswordReset(hashToken('token-two'), 'other', new Date())).toBeNull();
    });

    it('two concurrent uses of one token: exactly one succeeds', async () => {
      await setup();
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) => store.completePasswordReset(hashToken('token-one'), `hash-${i}`, new Date())),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('expired tokens are rejected', async () => {
      await setup();
      expect(await store.completePasswordReset(hashToken('token-one'), 'x', new Date(Date.now() + 120_000))).toBeNull();
    });
  });

  describe('devices', () => {
    it('lists, touches and revokes by id, scoped to the owner', async () => {
      const a = await store.createUser({ email: 'a@d.co', displayName: 'Ad', passwordHash: 'x', role: 'player' });
      const b = await store.createUser({ email: 'b@d.co', displayName: 'Bd', passwordHash: 'x', role: 'player' });
      const later = new Date(Date.now() + 3_600_000);
      await store.createSession({ createdAt: new Date(), tokenHash: 'd'.repeat(64), userId: a.id, expiresAt: later, ip: '203.0.113.5', userAgent: 'A1' });
      await store.createSession({ createdAt: new Date(), tokenHash: 'e'.repeat(64), userId: a.id, expiresAt: later, ip: null, userAgent: 'A2' });
      await store.createSession({ createdAt: new Date(), tokenHash: 'f'.repeat(64), userId: b.id, expiresAt: later, ip: null, userAgent: 'B1' });

      await store.touchSession('e'.repeat(64), new Date(Date.now() + 60_000));
      const sessions = await store.listActiveSessions(a.id, new Date());
      expect(sessions.map((s) => s.userAgent)).toEqual(['A2', 'A1']);
      expect(sessions[1]).toMatchObject({ ip: '203.0.113.5' });
      expect(sessions[0]!.id).toMatch(/^[0-9a-f-]{36}$/);

      const bSession = (await store.listActiveSessions(b.id, new Date()))[0]!;
      expect(await store.revokeSessionById(a.id, bSession.id, new Date())).toBe(false);
      expect(await store.revokeSessionById(a.id, sessions[1]!.id, new Date())).toBe(true);
      expect((await store.listActiveSessions(a.id, new Date())).map((s) => s.userAgent)).toEqual(['A2']);
      expect(await store.findActiveSession('f'.repeat(64), new Date())).not.toBeNull();
    });
  });

  describe('case runs', () => {
    const guest = { kind: 'guest' as const, tokenHash: 'a'.repeat(64) };

    it('concurrent first visits create exactly one run', async () => {
      const cases = new PostgresCaseStore(pool);
      const runs = await Promise.all(Array.from({ length: 5 }, () => cases.createRun(guest, 'case-001', freshRun())));
      expect(new Set(runs.map((r) => r.id)).size).toBe(1);
    });

    it('saves only from the version that was read (optimistic locking)', async () => {
      const cases = new PostgresCaseStore(pool);
      const run = await cases.createRun(guest, 'case-001', freshRun());
      const changed = { ...freshRun(), found: ['message'] };
      expect(await cases.saveRun(run.id, changed, run.version)).toBe(true);
      expect(await cases.saveRun(run.id, freshRun(), run.version)).toBe(false);
      expect((await cases.findRun(guest, 'case-001'))).toMatchObject({ version: 2, state: changed });
    });

    it('claims a guest run for a user only if the user has none', async () => {
      const cases = new PostgresCaseStore(pool);
      const user = await store.createUser({ email: 'c@r.co', displayName: 'Case', passwordHash: 'x', role: 'player' });
      const owner = { kind: 'user' as const, userId: user.id };
      await cases.createRun(guest, 'case-001', { ...freshRun(), found: ['boat'] });
      expect(await cases.claimGuestRun(guest.tokenHash, user.id, 'case-001')).toBe(true);
      expect((await cases.findRun(owner, 'case-001'))?.state).toMatchObject({ found: ['boat'] });
      expect(await cases.findRun(guest, 'case-001')).toBeNull();

      const second = { kind: 'guest' as const, tokenHash: 'b'.repeat(64) };
      await cases.createRun(second, 'case-001', freshRun());
      expect(await cases.claimGuestRun(second.tokenHash, user.id, 'case-001')).toBe(false);
    });

    it('a run has exactly one owner, and goes when its user is deleted', async () => {
      await expect(pool.query(`INSERT INTO case_runs (case_id, state) VALUES ('case-001', '{}')`)).rejects.toThrow(/case_runs_one_owner/);
      const cases = new PostgresCaseStore(pool);
      const user = await store.createUser({ email: 'd@r.co', displayName: 'Del', passwordHash: 'x', role: 'player' });
      await cases.createRun({ kind: 'user', userId: user.id }, 'case-001', freshRun());
      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
      expect((await pool.query('SELECT count(*)::int AS n FROM case_runs')).rows[0].n).toBe(0);
    });

    it('full HTTP playthrough on Postgres', async () => {
      const { app } = await makeApp({ store, caseStore: new PostgresCaseStore(pool) });
      const first = await app.inject({ method: 'GET', url: '/cases/case-001' });
      const cookie = first.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      const act = (payload: object) => app.inject({ method: 'POST', url: '/cases/case-001/actions', payload, headers: { cookie } });
      await act({ type: 'open', app: 'messages' });
      await act({ type: 'open', app: 'files' });
      expect((await act({ type: 'unlock', password: '1998' })).json().view.archive.unlocked).toBe(true);
      await app.close();
    });
  });
});
