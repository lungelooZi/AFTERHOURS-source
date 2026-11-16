import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors.ts';
import { hashPassword } from '../src/auth/password.ts';
import { alice, ctx, FAST_HASH, makeService } from './helpers.ts';

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'no error';
  } catch (err) {
    return err instanceof AppError ? err.code : `unexpected: ${(err as Error).message}`;
  }
};

describe('AuthService.register', () => {
  it('creates a player with a normalised email and a working session', async () => {
    const { auth } = makeService();
    const issued = await auth.register(alice, ctx);
    expect(issued.user).toMatchObject({ email: 'alice@example.com', displayName: 'Alice', role: 'player' });
    expect(issued.token).toMatch(/^[\w-]{43}$/);
    expect(await auth.authenticate(issued.token)).toEqual(issued.user);
  });

  it('never stores the password or the raw token', async () => {
    const { auth, store } = makeService();
    const issued = await auth.register(alice, ctx);
    const stored = await store.findUserByEmail('alice@example.com');
    expect(stored?.passwordHash).toMatch(/^scrypt\$/);
    expect(stored?.passwordHash).not.toContain(alice.password);
    expect(await store.findActiveSession(issued.token, new Date())).toBeNull();
  });

  it('rejects duplicate emails regardless of case', async () => {
    const { auth } = makeService();
    await auth.register(alice, ctx);
    expect(await codeOf(auth.register({ ...alice, email: 'ALICE@example.COM' }, ctx))).toBe('email_taken');
  });

  it.each([
    [{ ...alice, password: 'short' }],
    [{ ...alice, email: 'not-an-email' }],
    [{ ...alice, displayName: ' ' }],
    [{ email: alice.email }],
    [null],
  ])('validates input %#', async (input) => {
    const { auth } = makeService();
    expect(await codeOf(auth.register(input, ctx))).toBe('validation_failed');
  });

  it('ignores a client-supplied role', async () => {
    const { auth } = makeService();
    const issued = await auth.register({ ...alice, role: 'admin' }, ctx);
    expect(issued.user.role).toBe('player');
  });
});

describe('AuthService.login', () => {
  it('signs in with the right password, case-insensitively by email', async () => {
    const { auth } = makeService();
    await auth.register(alice, ctx);
    const issued = await auth.login({ email: ' ALICE@example.com ', password: alice.password }, ctx);
    expect(issued.user.email).toBe('alice@example.com');
  });

  it('gives the same error for an unknown email and a wrong password', async () => {
    const { auth } = makeService();
    await auth.register(alice, ctx);
    expect(await codeOf(auth.login({ email: alice.email, password: 'wrong password!' }, ctx))).toBe('invalid_credentials');
    expect(await codeOf(auth.login({ email: 'nobody@example.com', password: 'whatever' }, ctx))).toBe('invalid_credentials');
  });

  it('locks out an account+IP after repeated failures, then recovers after the window', async () => {
    const { auth, clock } = makeService({ maxAttempts: 3 });
    await auth.register(alice, ctx);
    for (let i = 0; i < 3; i++) await codeOf(auth.login({ email: alice.email, password: 'nope nope' }, ctx));
    // Even the correct password is refused while locked, so guessing gains nothing.
    expect(await codeOf(auth.login({ email: alice.email, password: alice.password }, ctx))).toBe('rate_limited');
    // A different IP is not affected by this account lockout.
    expect(await codeOf(auth.login({ email: alice.email, password: alice.password }, { ...ctx, ip: '198.51.100.1' }))).toBe('no error');
    clock.advance(15 * 60_000 + 1);
    expect(await codeOf(auth.login({ email: alice.email, password: alice.password }, ctx))).toBe('no error');
  });

  it('limits one IP spraying many different accounts', async () => {
    const { auth } = makeService({ maxAttempts: 2 }); // IP limit is 10x = 20
    for (let i = 0; i < 20; i++) await codeOf(auth.login({ email: `victim${i}@example.com`, password: 'guess' }, ctx));
    expect(await codeOf(auth.login({ email: 'victim99@example.com', password: 'guess' }, ctx))).toBe('rate_limited');
  });

  it('a successful login to an attacker-owned account does not clear the IP limit', async () => {
    const { auth } = makeService({ maxAttempts: 2 }); // IP limit is 20
    await auth.register({ ...alice, email: 'attacker@example.com' }, ctx);
    for (let i = 0; i < 19; i++) await codeOf(auth.login({ email: `victim${i}@example.com`, password: 'guess' }, ctx));
    expect(await codeOf(auth.login({ email: 'attacker@example.com', password: alice.password }, ctx))).toBe('no error');
    await codeOf(auth.login({ email: 'victim19@example.com', password: 'guess' }, ctx));
    expect(await codeOf(auth.login({ email: 'victim20@example.com', password: 'guess' }, ctx))).toBe('rate_limited');
  });

  it('upgrades a hash made with weaker parameters on successful login', async () => {
    const { auth, store } = makeService();
    const weak = await hashPassword(alice.password, { ...FAST_HASH, N: 2 ** 8 });
    await store.createUser({ email: 'alice@example.com', displayName: 'Alice', passwordHash: weak, role: 'player' });
    await auth.login(alice, ctx);
    const after = await store.findUserByEmail('alice@example.com');
    expect(after?.passwordHash).not.toBe(weak);
    expect(after?.passwordHash.startsWith(`scrypt$${FAST_HASH.N}$`)).toBe(true);
  });

  it('writes an audit trail for registration, sign-in and failures', async () => {
    const { auth, store } = makeService();
    await auth.register(alice, ctx);
    await codeOf(auth.login({ email: alice.email, password: 'wrong password' }, ctx));
    const actions = (await store.listAudit(10)).map((e) => e.action);
    expect(actions).toEqual(['session.login_failed', 'session.created', 'user.registered']);
  });
});

describe('sessions', () => {
  it('expire after the configured TTL', async () => {
    const { auth, clock } = makeService({ ttlMs: 60_000 });
    const { token } = await auth.register(alice, ctx);
    clock.advance(59_999);
    expect(await auth.authenticate(token)).not.toBeNull();
    clock.advance(1);
    expect(await auth.authenticate(token)).toBeNull();
  });

  it('logout revokes only the current session; logout-all revokes every session', async () => {
    const { auth } = makeService();
    const first = await auth.register(alice, ctx);
    const second = await auth.login(alice, ctx);
    const third = await auth.login(alice, ctx);
    await auth.logout(first.token, first.user, ctx);
    expect(await auth.authenticate(first.token)).toBeNull();
    expect(await auth.authenticate(second.token)).not.toBeNull();
    expect(await auth.logoutEverywhere(second.user, ctx)).toBe(2);
    expect(await auth.authenticate(third.token)).toBeNull();
  });

  it('rejects unknown and empty tokens', async () => {
    const { auth } = makeService();
    expect(await auth.authenticate(undefined)).toBeNull();
    expect(await auth.authenticate('')).toBeNull();
    expect(await auth.authenticate('made-up-token')).toBeNull();
  });
});

describe('roles', () => {
  it('only admins can change roles, and the change applies to live sessions', async () => {
    const { auth, store } = makeService();
    const admin = await auth.register({ ...alice, email: 'admin@example.com' }, ctx);
    await store.setUserRole(admin.user.id, 'admin');
    const adminUser = { ...admin.user, role: 'admin' as const };
    const bob = await auth.register({ ...alice, email: 'bob@example.com', displayName: 'Bob' }, ctx);

    expect(await codeOf(auth.changeRole(bob.user, admin.user.id, { role: 'player' }, ctx))).toBe('forbidden');
    await auth.changeRole(adminUser, bob.user.id, { role: 'creator' }, ctx);
    expect((await auth.authenticate(bob.token))?.role).toBe('creator');
  });

  it('stops an admin from removing their own admin role', async () => {
    const { auth, store } = makeService();
    const admin = await auth.register(alice, ctx);
    await store.setUserRole(admin.user.id, 'admin');
    const adminUser = { ...admin.user, role: 'admin' as const };
    expect(await codeOf(auth.changeRole(adminUser, admin.user.id, { role: 'player' }, ctx))).toBe('validation_failed');
  });

  it('validates the role and the target', async () => {
    const { auth } = makeService();
    const admin = { id: '00000000-0000-4000-8000-000000000000', email: 'a@x.io', displayName: 'Ad', role: 'admin' as const, createdAt: new Date() };
    expect(await codeOf(auth.changeRole(admin, 'missing', { role: 'creator' }, ctx))).toBe('not_found');
    expect(await codeOf(auth.changeRole(admin, 'missing', { role: 'superuser' }, ctx))).toBe('validation_failed');
  });
});
